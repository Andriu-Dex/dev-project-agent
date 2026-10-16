const day=86_400_000;
// The first delivery is explicitly limited to Ecuador's UTC-05:00 schedule.
export function nextWeeklyCutoff(after:Date,weekday=5,hour=18,minute=0) {
  if(!Number.isFinite(after.getTime())||!Number.isInteger(weekday)||weekday<0||weekday>6||!Number.isInteger(hour)||hour<0||hour>23||!Number.isInteger(minute)||minute<0||minute>59)throw new Error('Invalid report schedule.');
  const local=new Date(after.getTime()-5*3_600_000);
  let cutoff=Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),local.getUTCDate(),hour+5,minute);
  cutoff+=((weekday-local.getUTCDay()+7)%7)*day;
  if(cutoff<=after.getTime())cutoff+=7*day;return new Date(cutoff);
}
