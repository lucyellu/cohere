import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDkSNbvqfCkx9F7t8lj-Ut1LpeW5DNysX4",
  authDomain: "gen-lang-client-0226257477.firebaseapp.com",
  projectId: "gen-lang-client-0226257477",
  storageBucket: "gen-lang-client-0226257477.firebasestorage.app",
  messagingSenderId: "531225475379",
  appId: "1:531225475379:web:be6bbed436e835802f6646",
  measurementId: "G-Z4FR51Z4LG"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
