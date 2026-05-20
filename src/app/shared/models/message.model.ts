export class Message {
    senderUid: string = "";
    sentToUid: string = "";
    message: string = "";
    number: number = 0;
    sentAt: Date = new Date();
    attachments?: string[];
    isRead?: boolean;
    isSent?: boolean;
    isReceived?: boolean;
    isDeleted?: boolean;
    isStarred?: boolean;
    isEdited?: boolean;
    isTyping?: boolean;
    readAt?: Date;

}
export class Messages {
    constructor(public messages: Message[]) { }
    setMessagesForFirestore() {
        const copy = { ...this.messages };
        console.log(copy)
        return copy;
    }
}
