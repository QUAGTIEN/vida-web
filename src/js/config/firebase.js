import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import {
    initializeFirestore,
    persistentLocalCache,
    persistentMultipleTabManager
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyDEZs5cwo4k4qAB51759Ja0EnGYUEqKBro",
    authDomain: "vida-web-9ec43.firebaseapp.com",
    projectId: "vida-web-9ec43",
    storageBucket: "vida-web-9ec43.firebasestorage.app",
    messagingSenderId: "324894580851",
    appId: "1:324894580851:web:8e8cda0bcc4280c17d0a06"
};

export const firebaseApp = initializeApp(firebaseConfig);

export const db = initializeFirestore(firebaseApp, {
    localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager()
    })
});

export const auth = getAuth(firebaseApp);
