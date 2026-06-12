import { Injectable, inject } from '@angular/core';

import { Message } from '../../../shared/models/message.model';
import { PublicProfile } from '../../../shared/models/public-profile.model';
import { UserClass } from '../../../shared/models/user.model';
import { MessagesStore } from '../store/messages.store';

@Injectable({
    providedIn: 'root',
})
export class MessagesFacade {
    readonly store = inject(MessagesStore);

    loadMessages(userProfile: UserClass, matchProfile: PublicProfile) {
        return this.store.loadMessages(userProfile, matchProfile);
    }

    loadOlderMessages(userProfile: UserClass, matchProfile: PublicProfile) {
        return this.store.loadOlderMessages(userProfile, matchProfile);
    }

    sendMessage(
        userProfile: UserClass,
        matchProfile: PublicProfile,
        message: Message
    ) {
        return this.store.sendMessage(userProfile, matchProfile, message);
    }

    retryMessage(
        userProfile: UserClass,
        matchProfile: PublicProfile,
        message: Message
    ) {
        return this.store.retryMessage(userProfile, matchProfile, message);
    }

    editMessage(
        userProfile: UserClass,
        matchProfile: PublicProfile,
        message: Message,
        nextText: string
    ) {
        return this.store.editMessage(userProfile, matchProfile, message, nextText);
    }

    deleteMessage(
        userProfile: UserClass,
        matchProfile: PublicProfile,
        message: Message
    ) {
        return this.store.deleteMessage(userProfile, matchProfile, message);
    }

    toggleMessageReaction(
        userProfile: UserClass,
        matchProfile: PublicProfile,
        message: Message,
        emoji: string
    ) {
        return this.store.toggleMessageReaction(
            userProfile,
            matchProfile,
            message,
            emoji
        );
    }

    setTypingStatus(
        userProfile: UserClass,
        matchProfile: PublicProfile,
        isTyping: boolean
    ) {
        return this.store.setTypingStatus(userProfile, matchProfile, isTyping);
    }

    clearMessages() {
        this.store.clearMessages();
    }
}
