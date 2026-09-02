import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import {
    initializeFirestore,
    persistentLocalCache,
    persistentMultipleTabManager
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

const firebaseConfig = {
    apiKey: "REPLACE_WITH_VIDA_API_KEY",
    authDomain: "REPLACE_WITH_VIDA_AUTH_DOMAIN",
    projectId: "REPLACE_WITH_VIDA_PROJECT_ID",
    storageBucket: "REPLACE_WITH_VIDA_STORAGE_BUCKET",
    messagingSenderId: "REPLACE_WITH_VIDA_MESSAGING_SENDER_ID",
    appId: "REPLACE_WITH_VIDA_APP_ID"
};

export const firebaseApp = initializeApp(firebaseConfig);

export const db = initializeFirestore(firebaseApp, {
    localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager()
    })
});

export const auth = getAuth(firebaseApp);
