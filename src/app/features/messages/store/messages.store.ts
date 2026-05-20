import { inject } from '@angular/core';
import {
    patchState,
    signalStore,
    withMethods,
    withState,
} from '@ngrx/signals';

import { Message } from '../../../shared/models/message.model';
import { UserClass } from '../../../shared/models/user.model';
import { MessagesRepository } from '../data-access/messages.repository';

type MessagesState = {
    messages: Message[];
    loading: boolean;
    error: string | null;
};

const initialState: MessagesState = {
    messages: [],
    loading: false,
    error: null,
};

export const MessagesStore = signalStore(
    {
        providedIn: 'root',
    },

    withState(initialState),

    withMethods((store, repository = inject(MessagesRepository)) => ({
        async loadMessages(userProfile: UserClass, matchProfile: UserClass) {
            if (
                !userProfile.uid ||
                !userProfile.email ||
                !matchProfile.uid ||
                !matchProfile.email
            ) {
                patchState(store, {
                    messages: [],
                });
                return;
            }

            patchState(store, {
                loading: true,
                error: null,
            });

            try {
                const messages = await repository.getMessages(
                    userProfile.uid,
                    userProfile.email,
                    matchProfile.uid,
                    matchProfile.email
                );

                patchState(store, {
                    messages,
                    loading: false,
                });
            } catch (error) {
                console.error(error);
                patchState(store, {
                    messages: [],
                    loading: false,
                    error: 'Failed to load messages.',
                });
            }
        },

        async sendMessage(
            userProfile: UserClass,
            matchProfile: UserClass,
            message: Message
        ) {
            if (
                !userProfile.uid ||
                !userProfile.email ||
                !matchProfile.uid ||
                !matchProfile.email
            ) {
                return;
            }

            const messages = [...store.messages(), message];

            patchState(store, {
                messages,
            });

            await repository.saveMessagesWithMatch(
                userProfile.uid,
                userProfile.email,
                matchProfile.uid,
                messages
            );
        },

        clearMessages() {
            patchState(store, initialState);
        },
    }))
);
