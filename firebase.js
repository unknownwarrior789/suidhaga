// ============================================================
//  firebase.js  —  Sui Dhaga | Central Firebase Module (Script Tag Based)
// ============================================================

const firebaseConfig = {
  apiKey:            "AIzaSyCV260rVvKEKN41bfX-IdLdpVju_LUJxQM",
  authDomain:        "suidhaga-67554.firebaseapp.com",
  projectId:         "suidhaga-67554",
  storageBucket:     "suidhaga-67554.firebasestorage.app",
  messagingSenderId: "646624824611",
  appId:             "1:646624824611:web:a57f52532604b5ed4bd096"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Global objects for use in other scripts
window.db = db;
window.serverTimestamp = firebase.firestore.FieldValue.serverTimestamp;

// Session Management
window.getSessionUser = function() { return sessionStorage.getItem("sd_user") || null; };
window.setSessionUser = function(u) { sessionStorage.setItem("sd_user", u); };
window.clearSession = function() { sessionStorage.removeItem("sd_user"); sessionStorage.removeItem("sd_role"); };
window.getSessionRole = function() { return sessionStorage.getItem("sd_role") || "customer"; };
window.setSessionRole = function(r) { sessionStorage.setItem("sd_role", r); };

// User Auth
window.signUpUser = async function({ username, name, email, password, role }) {
  try {
    const existingUser = await db.collection("users").doc(username).get();
    if (existingUser.exists) return { ok: false, error: "Username already taken." };

    const snapE = await db.collection("users").where("email", "==", email).get();
    if (!snapE.empty) return { ok: false, error: "Email already registered." };

    await db.collection("users").doc(username).set({ username, name, email, password, role: role || "customer" });
    setSessionUser(username);
    setSessionRole(role || "customer");
    return { ok: true };
  } catch (err) {
    console.error("signUpUser error:", err);
    return { ok: false, error: "Something went wrong: " + (err.message || err) };
  }
};

window.loginUser = async function({ username, password }) {
  try {
    const userRef  = db.collection("users").doc(username);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      const snap = await db.collection("users").where("username", "==", username).get();
      if (snap.empty) return { ok: false, error: "Incorrect username or password." };
      const user = snap.docs[0].data();
      if (user.password !== password) return { ok: false, error: "Incorrect username or password." };
      setSessionUser(username);
      setSessionRole(user.role === "designer" ? "designer" : "customer");
      return { ok: true, user };
    }

    const user = userSnap.data();
    if (user.password !== password) return { ok: false, error: "Incorrect username or password." };
    setSessionUser(username);
    setSessionRole(user.role === "designer" ? "designer" : "customer");
    return { ok: true, user };
  } catch (err) {
    console.error("loginUser error:", err);
    return { ok: false, error: "Something went wrong: " + (err.message || err) };
  }
};

window.getUserProfile = async function(username) {
  try {
    const snap = await db.collection("users").doc(username).get();
    return snap.exists ? snap.data() : null;
  } catch (err) { return null; }
};

window.saveMeasurements = async function(username, data) {
  try {
    await db.collection("measurements").doc(username).set({ username, ...data, updatedAt: serverTimestamp() });
    return { ok: true };
  } catch (err) { return { ok: false, error: "Could not save measurements." }; }
};

window.getMeasurements = async function(username) {
  try {
    const snap = await db.collection("measurements").doc(username).get();
    return snap.exists ? snap.data() : null;
  } catch (err) { return null; }
};

window.getDesigners = async function() {
  try {
    const snap = await db.collection("designers").get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) { return []; }
};

window.getDesignerByUsername = async function(username) {
  try {
    const snap = await db.collection("designers").doc(username).get();
    return snap.exists ? { id: snap.id, ...snap.data() } : null;
  } catch (err) { return null; }
};

window.saveDesign = async function(username, designData) {
  try {
    await db.collection("designs").add({ username, ...designData, createdAt: serverTimestamp() });
    return { ok: true };
  } catch (err) { return { ok: false, error: "Could not save design." }; }
};

window.getUserDesigns = async function(username) {
  try {
    const snap = await db.collection("designs").where("username", "==", username).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) { return []; }
};

// ─── ORDERS ──────────────────────────────────────────────────
window.placeOrder = async function({ orderId, username, designerUsername, config, totalAmount }) {
  try {
    await db.collection("orders").doc(orderId).set({
      orderId, username, designerUsername, config, totalAmount,
      status: "confirmed", placedAt: serverTimestamp()
    });
    return { ok: true };
  } catch (err) { return { ok: false, error: "Could not place order." }; }
};

window.getCustomerOrders = async function(username) {
  try {
    const snap = await db.collection("orders").where("username", "==", username).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) { return []; }
};

window.getDesignerOrders = async function(designerUsername) {
  try {
    const snap = await db.collection("orders").where("designerUsername", "==", designerUsername).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) { return []; }
};

window.updateOrderStatus = async function(orderId, status) {
  try {
    await db.collection("orders").doc(orderId).update({ status });
    return { ok: true };
  } catch (err) { return { ok: false, error: err.message }; }
};

// ─── CHAT ────────────────────────────────────────────────────
window.buildChatId = function(customerUsername, designerUsername) {
  return `${customerUsername}__${designerUsername}`;
};

window.sendChatMessage = async function(chatId, { senderUsername, senderRole, text }) {
  try {
    // 1. Write the message to the subcollection
    await db.collection("chats").doc(chatId).collection("messages").add({
      senderUsername, senderRole, text, sentAt: serverTimestamp()
    });

    // 2. Write/update parent chat doc with metadata so designers can discover conversations
    const parts = chatId.split("__");
    if (parts.length === 2) {
      await db.collection("chats").doc(chatId).set({
        customerUsername: parts[0],
        designerUsername: parts[1],
        lastMessage: text,
        lastSender: senderRole,
        updatedAt: serverTimestamp()
      }, { merge: true });
    }

    return { ok: true };
  } catch (err) {
    console.error("sendChatMessage error:", err);
    return { ok: false, error: "Failed to send message." };
  }
};

window.listenToChat = function(chatId, callback) {
  return db.collection("chats").doc(chatId).collection("messages")
    .orderBy("sentAt", "asc")
    .onSnapshot((snap) => {
      callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
};

window.getChatMessages = async function(chatId) {
  try {
    const snap = await db.collection("chats").doc(chatId).collection("messages").orderBy("sentAt", "asc").get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) { return []; }
};

// ─── DESIGNER CHATS (discover all conversations) ────────────
window.getDesignerChats = async function(designerUsername) {
  try {
    const snap = await db.collection("chats").where("designerUsername", "==", designerUsername).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) { console.error("getDesignerChats error:", err); return []; }
};

window.listenToDesignerChats = function(designerUsername, callback) {
  return db.collection("chats")
    .where("designerUsername", "==", designerUsername)
    .onSnapshot((snap) => {
      callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => {
      console.error("listenToDesignerChats error:", err);
    });
};
