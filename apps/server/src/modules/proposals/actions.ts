import type {RequestedTrelloChange,TrelloAction,TrelloItem,TrelloSnapshot,TrackingPolicyResponse} from '@dev-project-agent/contracts';
import {assertTargetDate,fingerprint,ProposalError} from './contracts.js';

export function buildAction(item:TrelloItem,snapshot:TrelloSnapshot,policy:TrackingPolicyResponse,request:RequestedTrelloChange):TrelloAction {
  let action:TrelloAction;
  if(request.family==='dates'){
    if([request.start,request.due].some(value=>!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)||!Number.isFinite(Date.parse(value))))throw new ProposalError('INVALID_TARGET_DATE');
    const start=new Date(request.start).toISOString(),due=new Date(request.due).toISOString();assertTargetDate(due,start);
    action={type:'trello_dates_change',cardId:item.id,expectedStart:item.start,expectedDue:item.due,proposedStart:start,proposedDue:due};
    if(item.start===start&&item.due===due)throw new ProposalError('NO_CHANGE');
  }else if(request.family==='members'){
    if(!request.memberIds.length||request.memberIds.length>20||new Set(request.memberIds).size!==request.memberIds.length||request.memberIds.some(id=>!snapshot.members.some(member=>member.id===id)))throw new ProposalError('INVALID_SCOPE');
    action={type:'trello_members_change',cardId:item.id,expectedMembers:[...item.memberIds].sort(),proposedMembers:[...request.memberIds].sort()};
    if(fingerprint(action.expectedMembers)===fingerprint(action.proposedMembers))throw new ProposalError('NO_CHANGE');
  }else {
    const mapping=request.family==='priority'?policy.priorityLabels??{}:policy.stateLabels??{};
    if(!Object.hasOwn(mapping,request.label))throw new ProposalError('INVALID_SCOPE');
    const proposedLabels=[...item.labelNames.filter(label=>!Object.hasOwn(mapping,label)),request.label].sort();
    const proposedDueComplete=request.family==='state'?policy.stateLabels![request.label]==='completed':item.dueComplete;
    if(request.family==='state'&&proposedDueComplete&&(policy.blockedLabels??[]).some(label=>item.labelNames.includes(label)))throw new ProposalError('BLOCKING_CHECK');
    action={type:request.family==='priority'?'trello_priority_change':'trello_state_change',cardId:item.id,expectedLabels:[...item.labelNames].sort(),proposedLabels,expectedDueComplete:item.dueComplete,proposedDueComplete};
    if(fingerprint(action.expectedLabels)===fingerprint(proposedLabels)&&item.dueComplete===proposedDueComplete)throw new ProposalError('NO_CHANGE');
  }
  return action;
}
export function validateActionDate(action:TrelloAction,start:string|null,reversal=false) {
  if(reversal){if(action.type==='trello_dates_change'&&action.proposedStart&&action.proposedDue&&Date.parse(action.proposedDue)<Date.parse(action.proposedStart))throw new ProposalError('TARGET_BEFORE_START');return;}
  if(action.type==='trello_due_change')assertTargetDate(action.proposedDue,start);
  if(action.type==='trello_dates_change')assertTargetDate(action.proposedDue??'',action.proposedStart);
}
export function matchesAction(item:TrelloItem,action:TrelloAction):boolean {
  if(action.type==='trello_due_change')return item.due===action.proposedDue;
  if(action.type==='trello_dates_change')return item.start===action.proposedStart&&item.due===action.proposedDue;
  if(action.type==='trello_members_change')return fingerprint([...item.memberIds].sort())===fingerprint(action.proposedMembers);
  return fingerprint([...item.labelNames].sort())===fingerprint(action.proposedLabels)&&item.dueComplete===action.proposedDueComplete;
}
export function restoreExpected(item:TrelloItem,action:TrelloAction,expectedState:TrelloItem['state']):TrelloItem {
  if(action.type==='trello_due_change')return {...item,due:action.expectedDue};
  if(action.type==='trello_dates_change')return {...item,start:action.expectedStart,due:action.expectedDue};
  if(action.type==='trello_members_change')return {...item,memberIds:action.expectedMembers};
  return {...item,labelNames:action.expectedLabels,dueComplete:action.expectedDueComplete,state:expectedState};
}
export function actionEvidence(action:TrelloAction) {
  return action.type==='trello_members_change'?'card.memberIds':action.type==='trello_priority_change'||action.type==='trello_state_change'?'card.labelNames':'card.due';
}

export function reverseAction(action:TrelloAction,item:TrelloItem):TrelloAction {
  if(!matchesAction(item,action))throw new ProposalError('SOURCE_CHANGED');
  if(action.type==='trello_due_change')return {type:'trello_dates_change',cardId:item.id,expectedStart:item.start,expectedDue:item.due,proposedStart:item.start,proposedDue:action.expectedDue};
  if(action.type==='trello_dates_change')return {...action,expectedStart:item.start,expectedDue:item.due,proposedStart:action.expectedStart,proposedDue:action.expectedDue};
  if(action.type==='trello_members_change')return {...action,expectedMembers:[...item.memberIds].sort(),proposedMembers:action.expectedMembers};
  return {...action,expectedLabels:[...item.labelNames].sort(),proposedLabels:action.expectedLabels,expectedDueComplete:item.dueComplete,proposedDueComplete:action.expectedDueComplete};
}
