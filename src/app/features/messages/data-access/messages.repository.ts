import { Injectable, Injector, inject, runInInjectionContext } from '@angular/core';
import {
    Firestore,
    doc,
    getDoc,
    setDoc,
} from '@angular/fire/firestore';

import { Message, Messages } from '../../../shared/models/message.model';

@Injectable({
    providedIn: 'root',
})
export class MessagesRepository {
    private injector = inject(Injector);
    private firestore = inject(Firestore);

    async getMessages(
        myUid: string,
        myEmail: string,
        matchUid: string,
        matchEmail: string
    ) {
        const msgsCopy: Messages = new Messages([]);

        const [myMessageSnapshot, matchMessageSnapshot] =
            await this.runInFirebaseContext(() => {
                const myMessageRef = doc(
                    this.firestore,
                    `matches/messages/${myEmail}/${matchUid}_${myUid}`
                );

                const matchMessageRef = doc(
                    this.firestore,
                    `matches/messages/${matchEmail}/${myUid}_${matchUid}`
                );

                return Promise.all([
                    getDoc(myMessageRef),
                    getDoc(matchMessageRef),
                ]);
            });

        const myMsgs = myMessageSnapshot.exists()
            ? (myMessageSnapshot.data() as Message)
            : undefined;

        const matchMsgs = matchMessageSnapshot.exists()
            ? (matchMessageSnapshot.data() as Message)
            : undefined;

        const allMsgs: any = {
            ...(myMsgs ?? {}),
            ...(matchMsgs ?? {}),
        };

        msgsCopy.messages = Object.values(allMsgs).flat() as Message[];
        msgsCopy.messages.sort((a, b) => a.number - b.number);

        return msgsCopy.messages;
    }

    async saveMessagesWithMatch(
        myUid: string,
        myEmail: string,
        matchUid: string,
        messages: Message[]
    ) {
        await this.runInFirebaseContext(() => {
            const messageRef = doc(
                this.firestore,
                `matches/messages/${myEmail}/${matchUid}_${myUid}`
            );

            return setDoc(messageRef, new Messages(messages).setMessagesForFirestore(), {
                merge: true,
            });
        });
    }

    private runInFirebaseContext<T>(callback: () => T): T {
        return runInInjectionContext(this.injector, callback);
    }
}
