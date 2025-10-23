// Lightweight OnlineService using Firebase (Firestore + Anonymous Auth)
// Usage: const online = new OnlineService(window.FIREBASE_CONFIG);
// await online.init(); await online.createRoom(scene.toJSON()); online.onState(cb); online.publishState(newState);

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signInAnonymously } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  updateDoc,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

function randomRoomId(len = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < len; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

export default class OnlineService {
  constructor(config) {
    this.config = config || (window && window.FIREBASE_CONFIG);
    this.app = null;
    this.db = null;
    this.auth = null;
    this.uid = null;

    this.roomId = null;
    this.roomRef = null;
    this.unsubscribe = null;

    this.player = null; // 1 or 2
    this.statusCb = null;
    this.stateCb = null;
  }

  async init() {
    if (!this.config) {
      console.warn('Firebase config missing. Define window.FIREBASE_CONFIG in assets/firebase-config.js');
      return { ok: false, message: '缺少 Firebase 配置' };
    }
    this.app = initializeApp(this.config);
    this.db = getFirestore(this.app);
    this.auth = getAuth(this.app);
    await signInAnonymously(this.auth);
    await new Promise((resolve) => onAuthStateChanged(this.auth, (u) => { if (u) { this.uid = u.uid; resolve(); } }));
    return { ok: true, uid: this.uid };
  }

  onStatus(cb) { this.statusCb = cb; }
  onState(cb) { this.stateCb = cb; }

  _emitStatus(msg) { this.statusCb && this.statusCb(msg); }

  async createRoom(initialState) {
    if (!this.db || !this.uid) throw new Error('OnlineService not initialized');
    const id = randomRoomId();
    const ref = doc(this.db, 'rooms', id);
    const payload = {
      createdAt: serverTimestamp(),
      version: 0,
      players: { 1: this.uid, 2: null },
      turn: 1,
      state: initialState || null,
    };
    await setDoc(ref, payload);
    this.roomId = id;
    this.roomRef = ref;
    this.player = 1;
    this._listen();
    this._emitStatus(`已创建房间 ${id}`);
    return { ok: true, roomId: id, player: 1 };
  }

  async joinRoom(id) {
    if (!this.db || !this.uid) throw new Error('OnlineService not initialized');
    const ref = doc(this.db, 'rooms', id);
    const snap = await getDoc(ref);
    if (!snap.exists()) return { ok: false, message: '房间不存在' };
    const data = snap.data();
    let assigned = null;
    if (!data.players?.[1]) assigned = 1; else if (!data.players?.[2]) assigned = 2;
    if (!assigned) return { ok: false, message: '房间已满' };
    await updateDoc(ref, { [`players.${assigned}`]: this.uid });
    this.roomId = id;
    this.roomRef = ref;
    this.player = assigned;
    this._listen();
    this._emitStatus(`已加入房间 ${id}`);
    return { ok: true, roomId: id, player: assigned };
  }

  leaveRoom() {
    if (this.unsubscribe) { this.unsubscribe(); this.unsubscribe = null; }
    const prevId = this.roomId;
    this.roomId = null; this.roomRef = null; this.player = null;
    this._emitStatus(prevId ? `已离开房间 ${prevId}` : '未连接');
  }

  _listen() {
    if (!this.roomRef) return;
    if (this.unsubscribe) this.unsubscribe();
    this.unsubscribe = onSnapshot(this.roomRef, (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      const state = data.state || null;
      const turn = data.turn || 1;
      const version = data.version || 0;
      this.stateCb && this.stateCb({ version, turn, state, players: data.players || {} });
    });
  }

  async publishState(nextState, expectedVersion) {
    if (!this.roomRef) return { ok: false, message: '未连接房间' };
    try {
      await runTransaction(this.db, async (trx) => {
        const docSnap = await trx.get(this.roomRef);
        if (!docSnap.exists()) throw new Error('房间不存在');
        const data = docSnap.data();
        const currentVersion = data.version || 0;
        if (expectedVersion != null && currentVersion !== expectedVersion) {
          throw new Error('版本不匹配');
        }
        trx.update(this.roomRef, {
          state: nextState,
          version: currentVersion + 1,
          turn: nextState.turn || data.turn || 1,
          updatedAt: serverTimestamp(),
        });
      });
      return { ok: true };
    } catch (e) {
      console.warn('publishState failed:', e.message);
      return { ok: false, message: e.message };
    }
  }

  getMyPlayer() { return this.player; }
  getRoomId() { return this.roomId; }
}
