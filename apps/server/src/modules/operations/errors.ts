export class OperationError extends Error {
  constructor(readonly code:string){super('Operation request failed.');}
}
