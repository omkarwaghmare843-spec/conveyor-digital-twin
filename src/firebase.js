import { initializeApp } from 'firebase/app';
import { getDatabase, ref, onValue } from 'firebase/database';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);

// Expected schema at the RTDB root:
// {
//   servoAngle: 30,          // 0-180, driven by the sorter servo
//   detectedColor: "red",    // "red" | "green" | "blue" | "none"
//   counts: { red: 0, green: 0, blue: 0 },
//   sensor: { r: 0, g: 0, b: 0, clear: 0 }, // raw color sensor reading
//   state: "idle",           // "idle" | "feeding" | "sensing" | "sorting" | "returning"
//   cycleId: 0,              // increments once per IR trigger/sort cycle
// }
export function subscribeToSorterState(callback) {
  const stateRef = ref(db, '/');
  return onValue(stateRef, (snapshot) => {
    callback(snapshot.val() || {});
  });
}

export function subscribeToConnectionState(callback) {
  const connectedRef = ref(db, '.info/connected');
  return onValue(connectedRef, (snapshot) => {
    callback(snapshot.val() === true);
  });
}
