// data.js - Firebase version with AI order processing
import { getFirestore, collection, getDocs, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

const db = getFirestore();
const auth = getAuth();
const AI_ENDPOINT = 'https://ollama.app.codecollective.us/api/chat';

function populateTable(tableId, data, keys) {
  const table = document.getElementById(tableId);
  table.innerHTML = '';

  if (!data || data.length === 0) {
    table.innerHTML = '<tr><td>No data</td></tr>';
    return;
  }

  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  keys.forEach(key => {
    const th = document.createElement('th');
    th.textContent = key;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  data.forEach(item => {
    const row = document.createElement('tr');
    keys.forEach(key => {
      const td = document.createElement('td');
      td.textContent = item[key] ?? '';
      row.appendChild(td);
    });
    tbody.appendChild(row);
  });
  table.appendChild(tbody);
}

async function processOrderWithAI(userId, transcription) {
  try {
    // First check Firestore connection
    const testDoc = await getDoc(doc(db, 'test', 'test'));
    if (!testDoc.exists()) {
      throw new Error('Firestore connection failed');
    }

    const response = await fetch(AI_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userId,
        transcription,
        currentOrder: await getCurrentOrder(userId)
      })
    });

    if (!response.ok) throw new Error('AI processing failed');
    
    const result = await response.json();
    await updateOrder(userId, result.updatedOrder);
    return result;
  } catch (error) {
    console.error('AI order processing error:', error);
    throw error;
  }
}

async function getCurrentOrder(userId) {
  const orderDoc = await getDoc(doc(db, 'users', userId, 'orders', 'current'));
  return orderDoc.exists() ? orderDoc.data() : {};
}

async function updateOrder(userId, orderData) {
  await setDoc(doc(db, 'users', userId, 'orders', 'current'), orderData);
  return getCurrentOrder(userId);
}

// Handle auth state changes
onAuthStateChanged(auth, async (user) => {
  if (user) {
    try {
      // Test Firestore connection first
      await getDoc(doc(db, 'test', 'test'));
      
      // Get user document
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (userDoc.exists()) {
        populateTable('userInfoTable', [userDoc.data()], Object.keys(userDoc.data()));
      }

      // Get services collection
      const servicesSnapshot = await getDocs(collection(db, 'services'));
      const services = servicesSnapshot.docs.map(doc => doc.data());
      populateTable('servicesTable', services, ['name', 'description', 'price']);

      // Get user's current order
      const order = await getCurrentOrder(user.uid);
      if (Object.keys(order).length > 0) {
        populateTable('orderTable', [order], Object.keys(order));
      }
    } catch (err) {
      console.error("Error fetching Firestore data:", err);
      document.getElementById("error").textContent = "Error retrieving data.";
    }
  } else {
    // Clear tables when logged out
    ['userInfoTable', 'servicesTable', 'orderTable'].forEach(tableId => {
      const table = document.getElementById(tableId);
      if (table) table.innerHTML = '<tr><td>Please login</td></tr>';
    });
  }
});

// Make available to audio.js
window.processVoiceOrder = async (userId, transcription) => {
  try {
    const result = await processOrderWithAI(userId, transcription);
    const order = await getCurrentOrder(userId);
    populateTable('orderTable', [order], Object.keys(order));
    return result;
  } catch (error) {
    document.getElementById("error").textContent = "Error processing order: " + error.message;
    throw error;
  }
};
