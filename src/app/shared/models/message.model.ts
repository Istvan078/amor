export type MessageType = 'text' | 'gif';

export type MessageGif = {
    id: string;
    title: string;
    url: string;
    previewUrl?: string;
    alt?: string;
    source: 'local';
};

export type MessageReaction = {
    emoji: string;
    userUids: string[];
    updatedAt?: Date;
};

export class Message {
    id?: string;
    senderUid: string = "";
    sentToUid: string = "";
    message: string = "";
    messageType: MessageType = 'text';
    number: number = 0;
    sentAt: Date = new Date();
    attachments?: string[];
    gif?: MessageGif;
    reactions?: MessageReaction[];
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
