export class Message {
 senderUid: string = "";
 sentToUid: string = "";
 message: string = "";
 number: number = 0;
}
export class Messages {
 constructor(public messages: Message[]) {}
 setMessagesForFirestore() {
  const copy = { ...this.messages };
  console.log(copy)
  return copy;
 }
}
