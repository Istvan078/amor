import { Message } from '../../../shared/models/message.model';

export type MessagesState = {
    messages: Message[];
    loading: boolean;
    loadingOlderMessages: boolean;
    hasOlderMessages: boolean;
    error: string | null;
    isMatchTyping: boolean;
};

export const initialMessagesState: MessagesState = {
    messages: [],
    loading: false,
    loadingOlderMessages: false,
    hasOlderMessages: false,
    error: null,
    isMatchTyping: false,
};
