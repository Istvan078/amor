export type MessageType = 'text' | 'gif';
export type MessageDeliveryStatus = 'sending' | 'sent' | 'failed';

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
    clientId?: string;
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
    editedAt?: Date;
    deletedAt?: Date;
    deliveryStatus?: MessageDeliveryStatus;
    sendError?: string;

}
export class Messages {
    constructor(public messages: Message[]) { }
    setMessagesForFirestore() {
        const copy = { ...this.messages };
        console.log(copy)
        return copy;
    }
}
