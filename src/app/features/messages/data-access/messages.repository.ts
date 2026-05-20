import { Injectable, inject } from '@angular/core';
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
    private firestore = inject(Firestore);

    async getMessages(
        myUid: string,
        myEmail: string,
        matchUid: string,
        matchEmail: string
    ) {
        const msgsCopy: Messages = new Messages([]);

        const myMessageRef = doc(
            this.firestore,
            `matches/messages/${myEmail}/${matchUid}_${myUid}`
        );

        const matchMessageRef = doc(
            this.firestore,
            `matches/messages/${matchEmail}/${myUid}_${matchUid}`
        );

        const myMessageSnapshot = await getDoc(myMessageRef);
        const matchMessageSnapshot = await getDoc(matchMessageRef);

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
        const messageRef = doc(
            this.firestore,
            `matches/messages/${myEmail}/${matchUid}_${myUid}`
        );

        await setDoc(messageRef, new Messages(messages).setMessagesForFirestore(), {
            merge: true,
        });
    }
}
