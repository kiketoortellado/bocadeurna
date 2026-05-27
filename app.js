import { initializeApp } from "firebase/app";
import { getAuth, setPersistence, signInWithEmailAndPassword, createUserWithEmailAndPassword, browserLocalPersistence, signOut, onAuthStateChanged } from "firebase/auth";
import { getFirestore, doc, getDoc, setDoc, updateDoc, collection, onSnapshot, runTransaction, query, orderBy, limit, writeBatch, getDocs, where } from "firebase/firestore";

// Configuración de Firebase
const firebaseConfig = {
    apiKey: "AIzaSyDezSI6Q--Fy25nOiu5zmgfxL2hre3nf2g",
    authDomain: "bocadeurna-2ab6d.firebaseapp.com",
    projectId: "bocadeurna-2ab6d",
    storageBucket: "bocadeurna-2ab6d.firebasestorage.app",
    messagingSenderId: "23922491266",
    appId: "1:23922491266:web:5e33115d92b4667e5bd99b",
    measurementId: "G-RCND17FP57"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Configurar persistencia local (7 días)
await setPersistence(auth, browserLocalPersistence);

// -------------------- DATOS ESTÁTICOS DESDE CSV --------------------
let locales = ["Gimnasio Municipal", "Colegio Nacional Sebastián de Yegros", "Esc. Carlos Antonio López"];
let intendentes = [];
let listasConcejales = {};
let concejalesIndividuales = [];

// Estado global reactivo
let currentUser = null;
let votosIntendentes = {};     // { local: { candidatoId: votos } }
let votosConcejales = {};      // { local: { concejalId: votos } }
let cargas = [];               // logs recientes
let listenersActive = false;

// Instancias de Gráficos
let chartInt, chartList;

// -------------------- FUNCIONES DE PARSEO CSV --------------------
function parseCSV(csvText) {
    if (csvText.charCodeAt(0) === 0xFEFF) csvText = csvText.slice(1);
    const lines = csvText.split(/\r?\n/);
    if (lines.length === 0) return [];
    const headers = lines[0].split(',').map(h => h.trim());
    const result = [];
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line === "") continue;
        let inQuote = false;
        let current = '';
        const row = [];
        for (let ch of line) {
            if (ch === '"') {
                inQuote = !inQuote;
            } else if (ch === ',' && !inQuote) {
                row.push(current.trim());
                current = '';
            } else {
                current += ch;
            }
        }
        row.push(current.trim());
        if (row.length === headers.length) {
            let obj = {};
            headers.forEach((h, idx) => { obj[h] = row[idx]; });
            result.push(obj);
        }
    }
    return result;
}

async function cargarDatosDesdeCSV() {
    const overlay = document.getElementById('loadingOverlay');
    try {
        const response = await fetch('data/elecciones_san_estanislao.csv', { cache: "no-cache" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const csvText = await response.text();
        const data = parseCSV(csvText);
        if (data.length === 0) throw new Error("CSV vacío");
        
        intendentes = [];
        concejalesIndividuales = [];
        listasConcejales = {};
        
        for (let row of data) {
            if (row.Categoria === 'Intendente') {
                intendentes.push({
                    id: row.Lista.toLowerCase().replace(/\s/g, ''),
                    nombre: row.Nombre,
                    lista: row.Lista,
                    alianza: row.Alianza
                });
            } else if (row.Categoria === 'Junta Municipal') {
                const lista = row.Lista;
                const opcion = parseInt(row.Opcion);
                const concejalId = `${lista}_${opcion}`;
                concejalesIndividuales.push({
                    id: concejalId,
                    nombre: row.Nombre,
                    lista: lista,
                    alianza: row.Alianza,
                    opcion: opcion
                });
                if (!listasConcejales[lista]) {
                    listasConcejales[lista] = {
                        nombre: row.Alianza,
                        color: obtenerColorParaLista(lista),
                        candidatos: []
                    };
                }
                listasConcejales[lista].candidatos[opcion-1] = { opcion, nombre: row.Nombre };
            }
        }
        for (let lista in listasConcejales) {
            listasConcejales[lista].candidatos = listasConcejales[lista].candidatos.filter(c => c);
            listasConcejales[lista].candidatos.sort((a,b) => a.opcion - b.opcion);
        }
        if (intendentes.length === 0) throw new Error("No hay intendentes");
        if (concejalesIndividuales.length === 0) throw new Error("No hay concejales");
        
        if (overlay) overlay.style.display = 'none';
        return true;
    } catch (error) {
        console.error(error);
        if (overlay) {
            overlay.innerHTML = `<div style="background:white; padding:2rem; border-radius:1rem; text-align:center;">
                <h3 style="color:#b0154f;">Error al cargar datos</h3>
                <p>${error.message}</p>
                <button onclick="location.reload()">Reintentar</button>
            </div>`;
        }
        return false;
    }
}

function obtenerColorParaLista(lista) {
    const colores = {
        '2C': '#c1272d', '2D': '#2c5f8a', '2F': '#1e6f5c', '2L': '#e9c46a',
        '2S': '#e76f51', '2T': '#6d597a', '5': '#b56576', '6': '#f4a261'
    };
    return colores[lista] || '#888888';
}

// -------------------- INICIALIZAR ESTRUCTURAS EN FIRESTORE --------------------
async function inicializarVotosEnFirestore() {
    if (!intendentes.length || !locales.length) return;
    const batch = writeBatch(db);
    
    for (let local of locales) {
        const docRef = doc(db, "intendentes_votes", local);
        const docSnap = await getDoc(docRef);
        if (!docSnap.exists()) {
            const initialData = {};
            intendentes.forEach(i => { initialData[i.id] = 0; });
            batch.set(docRef, initialData);
        }
    }
    for (let local of locales) {
        const docRef = doc(db, "concejales_votes", local);
        const docSnap = await getDoc(docRef);
        if (!docSnap.exists()) {
            const initialData = {};
            concejalesIndividuales.forEach(c => { initialData[c.id] = 0; });
            batch.set(docRef, initialData);
        }
    }
    await batch.commit();
}

async function crearAdminInicial() {
    const adminUsername = "Admin";
    const adminEmail = `${adminUsername.toLowerCase()}@bocadeurna.local`;
    const adminPassword = "620rnasa";
    const adminDocRef = doc(db, "users", adminUsername.toLowerCase());
    const adminSnap = await getDoc(adminDocRef);
    if (!adminSnap.exists()) {
        try {
            const userCred = await createUserWithEmailAndPassword(auth, adminEmail, adminPassword);
            const uid = userCred.user.uid;
            await setDoc(adminDocRef, {
                uid: uid,
                username: adminUsername,
                fullName: "Administrador",
                role: "admin",
                localAsignado: null
            });
        } catch (error) {
            if (error.code !== 'auth/email-already-in-use') {
                console.error("Error creando admin:", error);
            }
        }
    }
}

// -------------------- LISTENERS EN TIEMPO REAL --------------------
function escucharVotos() {
    if (listenersActive) return;
    listenersActive = true;
    
    for (let local of locales) {
        const docRef = doc(db, "intendentes_votes", local);
        onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists()) {
                votosIntendentes[local] = docSnap.data();
                if (currentUser && currentUser.role === 'admin') {
                    renderAdminStats();
                }
            }
        });
        
        const docRefConc = doc(db, "concejales_votes", local);
        onSnapshot(docRefConc, (docSnap) => {
            if (docSnap.exists()) {
                votosConcejales[local] = docSnap.data();
                if (currentUser && currentUser.role === 'admin') {
                    renderAdminStats();
                }
            }
        });
    }
    
    const logsQuery = query(collection(db, "logs"), orderBy("timestamp", "desc"), limit(200));
    onSnapshot(logsQuery, (snapshot) => {
        cargas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (currentUser && currentUser.role === 'admin') {
            renderAllLogs();
        } else if (currentUser && currentUser.role === 'digitador') {
            renderMisCargas();
        }
    });
}

// -------------------- REGISTRO DE VOTOS CON TRANSACCIÓN --------------------
async function registrarVoto(local, tipo, id, votos, usuario, concejalNombre = null, listaId = null) {
    votos = parseInt(votos);
    if (isNaN(votos) || votos <= 0) return false;
    try {
        if (tipo === "intendente") {
            const docRef = doc(db, "intendentes_votes", local);
            await runTransaction(db, async (transaction) => {
                const docSnap = await transaction.get(docRef);
                if (!docSnap.exists()) throw new Error("Documento no existe");
                const currentData = docSnap.data();
                const newVal = (currentData[id] || 0) + votos;
                transaction.update(docRef, { [id]: newVal });
            });
            await setDoc(doc(collection(db, "logs")), {
                timestamp: new Date().toISOString(),
                usuario: usuario,
                local: local,
                tipo: "intendente",
                candidatoId: id,
                listaId: null,
                concejalNombre: null,
                votos: votos
            });
        } else if (tipo === "concejal") {
            const docRef = doc(db, "concejales_votes", local);
            await runTransaction(db, async (transaction) => {
                const docSnap = await transaction.get(docRef);
                if (!docSnap.exists()) throw new Error("Documento no existe");
                const currentData = docSnap.data();
                const newVal = (currentData[id] || 0) + votos;
                transaction.update(docRef, { [id]: newVal });
            });
            await setDoc(doc(collection(db, "logs")), {
                timestamp: new Date().toISOString(),
                usuario: usuario,
                local: local,
                tipo: "concejal",
                candidatoId: null,
                listaId: listaId,
                concejalNombre: concejalNombre,
                votos: votos
            });
        }
        return true;
    } catch (error) {
        console.error("Error en transacción:", error);
        alert("Error al registrar voto. Intente de nuevo.");
        return false;
    }
}

// -------------------- CÁLCULOS DE TOTALES --------------------
function totalIntendentes() {
    let total = {};
    intendentes.forEach(i => total[i.id] = 0);
    locales.forEach(local => {
        const data = votosIntendentes[local] || {};
        intendentes.forEach(i => {
            total[i.id] += data[i.id] || 0;
        });
    });
    return total;
}

function totalVotosPorLista() {
    const totales = {};
    Object.keys(listasConcejales).forEach(lid => totales[lid] = 0);
    for (const local in votosConcejales) {
        const data = votosConcejales[local] || {};
        for (const concejalId in data) {
            const listaId = concejalId.split('_')[0];
            if (totales[listaId] !== undefined) {
                totales[listaId] += data[concejalId];
            }
        }
    }
    return totales;
}

function calcularDHondt(votosPorLista, bancas) {
    let listas = Object.keys(votosPorLista).filter(lid => votosPorLista[lid] > 0);
    if (listas.length === 0) return {};
    let cocientes = [];
    for (let lista of listas) {
        for (let i = 1; i <= bancas; i++) {
            cocientes.push({ lista, cociente: votosPorLista[lista] / i });
        }
    }
    cocientes.sort((a,b) => b.cociente - a.cociente);
    let asignacion = {};
    for (let i = 0; i < bancas; i++) {
        if (cocientes[i]) asignacion[cocientes[i].lista] = (asignacion[cocientes[i].lista] || 0) + 1;
    }
    return asignacion;
}

function calcularResultadosConcejales() {
    const votosPorLista = totalVotosPorLista();
    const bancasPorLista = calcularDHondt(votosPorLista, 12);
    
    const votosIndividuales = {};
    for (const concejal of concejalesIndividuales) {
        votosIndividuales[concejal.id] = 0;
        for (const local in votosConcejales) {
            votosIndividuales[concejal.id] += (votosConcejales[local]?.[concejal.id] || 0);
        }
    }
    
    const candidatosPorListaOrdenados = {};
    for (const listaId in listasConcejales) {
        candidatosPorListaOrdenados[listaId] = concejalesIndividuales
            .filter(c => c.lista === listaId)
            .map(c => ({ ...c, votos: votosIndividuales[c.id] }))
            .sort((a, b) => b.votos - a.votos);
    }
    
    const electos = [];
    for (const listaId in bancasPorLista) {
        const bancas = bancasPorLista[listaId];
        const candidatosOrdenados = candidatosPorListaOrdenados[listaId];
        for (let i = 0; i < bancas && i < candidatosOrdenados.length; i++) {
            electos.push(candidatosOrdenados[i]);
        }
    }
    electos.sort((a, b) => b.votos - a.votos);
    
    const candidatosPorListaOriginal = {};
    for (const listaId in listasConcejales) {
        candidatosPorListaOriginal[listaId] = listasConcejales[listaId].candidatos.map(c => {
            const concejal = concejalesIndividuales.find(ci => ci.lista === listaId && ci.opcion === c.opcion);
            return {
                opcion: c.opcion,
                nombre: c.nombre,
                votos: concejal ? votosIndividuales[concejal.id] : 0
            };
        });
    }
    return { votosPorLista, bancasPorLista, candidatosPorListaOriginal, electos };
}

// -------------------- RENDER ADMIN (TABLAS Y GRÁFICOS) --------------------
function renderAdminStats() {
    if (!currentUser || currentUser.role !== 'admin') return;
    renderTablaIntendentesPorLocal();
    renderTablaListasPorLocal();
    
    const resultados = calcularResultadosConcejales();
    renderDhondt(resultados.votosPorLista, resultados.bancasPorLista);
    renderElectos(resultados.electos);
    renderDetalleConcejales(resultados.candidatosPorListaOriginal);
    renderMiniResumen();
    
    const totalInt = totalIntendentes();
    const totalIntSum = Object.values(totalInt).reduce((a,b)=>a+b,0);
    const ctxInt = document.getElementById('intendentesChart')?.getContext('2d');
    if (ctxInt) {
        if (chartInt) chartInt.destroy();
        chartInt = new Chart(ctxInt, {
            type: 'pie',
            data: {
                labels: intendentes.map(i=>`${i.nombre} (${i.lista})`),
                datasets: [{
                    data: intendentes.map(i=>totalInt[i.id]),
                    backgroundColor: ['#006D5B','#D81B60']
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    datalabels: {
                        backgroundColor: '#ffffffcc',
                        borderRadius: 4,
                        padding: 4,
                        formatter: (value, ctx) => {
                            const percent = totalIntSum ? ((value/totalIntSum)*100).toFixed(1) : 0;
                            return `${percent}%`;
                        },
                        color: '#1a2e2a',
                        font: { weight: 'bold', size: 12 }
                    }
                }
            }
        });
    }
    
    const totalListas = resultados.votosPorLista;
    const totalListasSum = Object.values(totalListas).reduce((a,b)=>a+b,0);
    const ctxList = document.getElementById('listasChart')?.getContext('2d');
    if (ctxList) {
        if (chartList) chartList.destroy();
        const listaIds = Object.keys(listasConcejales);
        chartList = new Chart(ctxList, {
            type: 'bar',
            data: {
                labels: listaIds.map(l => `Lista ${l}`),
                datasets: [{
                    label: 'Votos',
                    data: listaIds.map(l => totalListas[l] || 0),
                    backgroundColor: listaIds.map(l => listasConcejales[l].color),
                    borderRadius: 8
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    datalabels: {
                        anchor: 'end',
                        align: 'top',
                        formatter: (value, ctx) => {
                            const percent = totalListasSum ? ((value/totalListasSum)*100).toFixed(1) : 0;
                            return `${value.toLocaleString()} (${percent}%)`;
                        },
                        color: '#1a2e2a',
                        font: { weight: 'bold', size: 11 }
                    }
                },
                scales: {
                    y: { beginAtZero: true, title: { display: true, text: 'Cantidad de votos' } }
                }
            }
        });
    }
}

function renderMiniResumen() {
    const totalInt = totalIntendentes();
    const totalIntSum = Object.values(totalInt).reduce((a,b)=>a+b,0);
    const resumenInt = document.getElementById("resumenIntendentes");
    if (resumenInt) {
        resumenInt.innerHTML = intendentes.map(i => `<p style="color:#1a2e2a;">${i.nombre}: <strong>${totalInt[i.id].toLocaleString()}</strong> (${totalIntSum ? ((totalInt[i.id]/totalIntSum)*100).toFixed(1) : 0}%)</p>`).join('');
    }
    const totalListas = totalVotosPorLista();
    const totalListasSum = Object.values(totalListas).reduce((a,b)=>a+b,0);
    const resumenConc = document.getElementById("resumenConcejales");
    if (resumenConc) {
        resumenConc.innerHTML = Object.keys(listasConcejales).map(lid => `<p style="color:#1a2e2a;">Lista ${lid}: <strong>${(totalListas[lid]||0).toLocaleString()}</strong> (${totalListasSum ? ((totalListas[lid]/totalListasSum)*100).toFixed(1) : 0}%)</p>`).join('');
    }
}

function renderTablaIntendentesPorLocal() {
    const thead = document.getElementById("intendentesHeader");
    const tbody = document.getElementById("intendentesBody");
    if(!thead) return;
    let header = "<tr><th>Local</th>";
    intendentes.forEach(i=>{ header+=`<th>${i.nombre} (${i.lista})</th>`; });
    header+="<th>Total Local</th></tr>";
    thead.innerHTML = header;
    let body = "";
    locales.forEach(local => {
        let fila = `<tr><td class="candidate-name">${local}</td>`;
        let sumaLocal=0;
        const data = votosIntendentes[local] || {};
        intendentes.forEach(i=>{ let v=data[i.id]||0; fila+=`<td>${v.toLocaleString()}</td>`; sumaLocal+=v; });
        fila+=`<td class="total-votes" style="font-weight:bold;">${sumaLocal.toLocaleString()}</td></tr>`;
        body+=fila;
    });
    const totalG = totalIntendentes();
    let filaTotal = `<tr style="background:#f7ede3; font-weight:bold;"><td>TOTAL GENERAL</td>`;
    intendentes.forEach(i=>{ filaTotal+=`<td>${totalG[i.id].toLocaleString()}</td>`; });
    filaTotal+=`<td>${(Object.values(totalG).reduce((a,b)=>a+b,0)).toLocaleString()}</td></tr>`;
    tbody.innerHTML = body + filaTotal;
}

function renderTablaListasPorLocal() {
    const thead = document.getElementById("listasHeader");
    const tbody = document.getElementById("listasBody");
    if(!thead) return;
    let header = "<tr><th>Local</th>";
    Object.keys(listasConcejales).forEach(lid=>{ header+=`<th>Lista ${lid}<br><small>${listasConcejales[lid].nombre}</small></th>`; });
    header+="<th>Total Local</th></tr>";
    thead.innerHTML = header;
    let body="";
    locales.forEach(local=>{
        let fila=`<tr><td class="candidate-name">${local}</td>`;
        let sumaLocal=0;
        const votosLocal = {};
        Object.keys(listasConcejales).forEach(lid=> votosLocal[lid]=0);
        const data = votosConcejales[local] || {};
        for (const concejalId in data) {
            const listaId = concejalId.split('_')[0];
            votosLocal[listaId] += data[concejalId];
        }
        Object.keys(listasConcejales).forEach(lid=>{
            let v=votosLocal[lid]||0;
            fila+=`<td>${v.toLocaleString()}</td>`;
            sumaLocal+=v;
        });
        fila+=`<td class="total-votes" style="font-weight:bold;">${sumaLocal.toLocaleString()}</td></tr>`;
        body+=fila;
    });
    const totalL = totalVotosPorLista();
    let sumaTotal=0;
    let filaTotal="<tr style='background:#f7ede3;font-weight:bold;'><td>TOTAL GENERAL</td>";
    Object.keys(listasConcejales).forEach(lid=>{ let v=totalL[lid]; filaTotal+=`<td>${v.toLocaleString()}</td>`; sumaTotal+=v; });
    filaTotal+=`<td>${sumaTotal.toLocaleString()}</td></tr>`;
    tbody.innerHTML = body + filaTotal;
}

function renderDhondt(votosPorLista, bancasPorLista) {
    const container = document.getElementById("dhondtResultado");
    if (!container) return;
    let html = `<table class="vote-table"><thead><tr><th>Lista</th><th>Votos totales de la lista</th><th>Bancas asignadas</th></tr></thead><tbody>`;
    const listasOrdenadas = Object.keys(votosPorLista).sort((a,b)=>votosPorLista[b]-votosPorLista[a]);
    for (let lid of listasOrdenadas) {
        html += `<tr>
            <td><strong>Lista ${lid}</strong><br><small>${listasConcejales[lid].nombre}</small></td>
            <td>${votosPorLista[lid].toLocaleString()}</td>
            <td style="font-weight:bold; color:var(--radio-fuchsia); font-size:1.1rem;">${bancasPorLista[lid]||0}</td>
        </tr>`;
    }
    html += `</tbody></table>`;
    container.innerHTML = html;
}

// Proyección de Concejales Electos
function renderElectos(electos) {
    const electosBody = document.getElementById("electosBody");
    if (electosBody) {
        electosBody.innerHTML = electos.map((c, idx) => `
            <tr>
                <td style="font-weight:bold;">${idx+1}°</td><td>Lista ${c.lista}</td><td class="candidate-name">${c.nombre}</td><td style="font-weight:bold;">${c.votos.toLocaleString()}</td>
            </tr>
        `).join('');
    }
}

function renderDetalleConcejales(candidatosPorListaOriginal) {
    const container = document.getElementById("concejalesDetalle");
    if (!container) return;
    let html = `<div style="display:flex; flex-wrap:wrap; gap:1rem;">`;
    for (const [lid, candidatos] of Object.entries(candidatosPorListaOriginal)) {
        const listaInfo = listasConcejales[lid];
        html += `<div style="flex:1; min-width:240px; background:#fef9ef; border-radius:1rem; padding:1rem; border-left:6px solid ${listaInfo.color}; color:#1a2e2a;">
            <h4 style="color:var(--radio-green); margin-bottom:0.3rem;">Lista ${lid}</h4>
            <p style="font-size:0.8rem; opacity:0.8; margin-bottom:0.5rem;">${listaInfo.nombre}</p>
            <p style="font-size:0.9rem; margin-bottom:0.5rem;"><strong>Votos lista:</strong> ${candidatos.reduce((sum,c)=>sum+c.votos,0).toLocaleString()}</p>
            <table class="detalle-sin-bordes">
                <thead><tr><th>N°</th><th>Candidato</th><th>Votos</th></tr></thead>
                <tbody>`;
        candidatos.forEach(c => {
            html += `<tr><td>${c.opcion}</td><td>${c.nombre}</td><td style="text-align:right; font-weight:bold;">${c.votos.toLocaleString()}</td></tr>`;
        });
        html += `</tbody></table></div>`;
    }
    html += `</div>`;
    container.innerHTML = html;
}

// -------------------- ADMIN: USUARIOS Y LOGS --------------------
async function crearDigitador(fullName, username, password, local) {
    try {
        const normalizedUsername = username.toLowerCase();
        const email = `${normalizedUsername}@bocadeurna.local`;
        const userCred = await createUserWithEmailAndPassword(auth, email, password);
        const uid = userCred.user.uid;
        await setDoc(doc(db, "users", normalizedUsername), {
            uid: uid,
            username: username,
            fullName: fullName,
            role: "digitador",
            localAsignado: local
        });
        return true;
    } catch (error) {
        console.error(error);
        alert(error.message);
        return false;
    }
}

async function eliminarDigitador(username) {
    if(confirm(`¿Eliminar usuario ${username}? Solo se deshabilitará de la base de datos local.`)){
        await setDoc(doc(db, "users", username.toLowerCase()), { disabled: true }, { merge: true });
        renderUsersTable();
    }
}

async function cambiarPasswordDigitador(username, newPass) {
    alert("Para cambiar contraseñas de forma segura, utilice la consola de administración en Firebase Auth.");
}

async function renderUsersTable() {
    const tbody = document.getElementById("usersTableBody");
    if(!tbody) return;
    const usersSnapshot = await getDocs(collection(db, "users"));
    const usersList = [];
    usersSnapshot.forEach(doc => {
        const data = doc.data();
        if(data.role === "digitador" && !data.disabled) usersList.push(data);
    });
    tbody.innerHTML = usersList.map(u => `
        <tr>
            <td style="color:#1a2e2a;">${u.fullName}</td><td style="color:#1a2e2a;">${u.username}</td><td style="color:#1a2e2a;">${u.localAsignado}</td>
            <td>
                <button class="edit-password-btn" data-user="${u.username}" style="background:#f4a261; border:none; color:white; padding:0.4rem 0.8rem; border-radius:1rem; cursor:pointer; font-weight:bold;">Contraseña</button>
                <button class="delete-user-btn" data-user="${u.username}" style="background:#b0154f; border:none; color:white; padding:0.4rem 0.8rem; border-radius:1rem; cursor:pointer; font-weight:bold;">Eliminar</button>
            </td>
        </tr>
    `).join("");
    document.querySelectorAll('.edit-password-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const username = btn.getAttribute('data-user');
            const newPass = prompt("Nueva contraseña para " + username);
            if (newPass && newPass.trim()) cambiarPasswordDigitador(username, newPass);
        });
    });
    document.querySelectorAll('.delete-user-btn').forEach(btn => {
        btn.addEventListener('click', () => eliminarDigitador(btn.getAttribute('data-user')));
    });
}

function renderAllLogs() {
    const tbody = document.getElementById("allLogsBody");
    if(!tbody) return;
    tbody.innerHTML = cargas.slice(0,200).map(c => `
        <tr>
            <td>${new Date(c.timestamp).toLocaleString()}</td><td>${c.usuario}</td><td>${c.local}</td>
            <td>${c.tipo === "intendente" ? "Intendente" : "Concejal"}</td>
            <td class="candidate-name">${c.candidatoId ? (intendentes.find(i=>i.id===c.candidatoId)?.nombre || c.candidatoId) : (c.listaId ? `Lista ${c.listaId}` : '')}</td>
            <td>${c.concejalNombre || '-'}</td><td style="font-weight:bold;">${c.votos}</td>
        </tr>
    `).join("");
}

// -------------------- PANEL DEL DIGITADOR (INTEGRACIÓN MÓVIL WIZARD) --------------------
function renderDigitadorPanel() {
    document.getElementById("digitadorPanel").innerHTML = `
        <div class="mobile-wizard-container">
            <div class="mobile-wizard-header">
                <div>
                    <span class="mobile-local-badge">
                        <i class="fas fa-map-marker-alt"></i> <span id="miLocalSpan">Cargando...</span>
                    </span>
                </div>
                <button id="logoutDigitadorBtn" class="mobile-logout-btn" title="Cerrar Sesión">
                    <i class="fas fa-sign-out-alt"></i>
                </button>
            </div>
            
            <div id="wizardStepContent"></div>
            
            <div id="wizardSuccessOverlay" class="wizard-success-overlay" style="display:none;">
                <div class="success-card">
                    <i class="fas fa-check-circle success-icon" id="successIcon"></i>
                    <h2 id="successMessageTitle">¡Voto Registrado!</h2>
                    <p id="successMessageSub">Preparando siguiente registro...</p>
                </div>
            </div>
        </div>
    `;
}

function loadDigitadorInterface() {
    // Asegurar visibilidad correcta del panel
    document.getElementById("digitadorPanel").style.display = "block";
    document.getElementById("adminPanel").style.display = "none";
    
    // Mostrar el local asignado al digitador actual
    const miLocalSpan = document.getElementById("miLocalSpan");
    if (miLocalSpan && currentUser) {
        miLocalSpan.innerText = currentUser.localAsignado || "Local Asignado";
    }
    
    // Configurar botón de cerrar sesión
    const logoutDigitadorBtn = document.getElementById('logoutDigitadorBtn');
    if (logoutDigitadorBtn) {
        logoutDigitadorBtn.onclick = logout;
    }
    
    // Objeto temporal que mantiene la selección del flujo actual
    let transaccionVoto = {
        intendenteId: null,
        listaId: null,
        concejalObj: null
    };
    
    // --- PASO 1: SELECCIÓN DE INTENDENTE (OBLIGATORIO) ---
    function mostrarPaso1() {
        transaccionVoto = { intendenteId: null, listaId: null, concejalObj: null };
        const container = document.getElementById("wizardStepContent");
        if (!container) return;
        
        let html = `
            <div class="wizard-step">
                <div class="wizard-progress">
                    <span class="step-dot active"></span>
                    <span class="step-dot"></span>
                    <span class="step-dot"></span>
                </div>
                <h2 class="wizard-title">Seleccione Intendente</h2>
                <div class="big-buttons-grid">
        `;
        
        if (typeof intendentes !== 'undefined' && intendentes.length > 0) {
            intendentes.forEach(i => {
                html += `
                    <button class="btn-big-option btn-intendente" data-id="${i.id}">
                        <span class="candidate-party">Lista ${i.lista || i.id}</span>
                        <span class="candidate-main-name">${i.nombre}</span>
                        <span class="candidate-sub">${i.alianza || ''}</span>
                    </button>
                `;
            });
        } else {
            html += `<p style="text-align:center; padding:2rem; color:#888;">No hay intendentes cargados en el sistema.</p>`;
        }
        
        html += `</div></div>`;
        container.innerHTML = html;
        
        container.querySelectorAll('.btn-intendente').forEach(btn => {
            btn.onclick = () => {
                transaccionVoto.intendenteId = btn.getAttribute('data-id');
                mostrarPaso2();
            };
        });
    }
    
    // --- PASO 2: SELECCIÓN DE LISTA DE CONCEJALES ---
    function mostrarPaso2() {
        const container = document.getElementById("wizardStepContent");
        if (!container) return;
        
        let html = `
            <div class="wizard-step">
                <div class="wizard-progress">
                    <span class="step-dot active"></span>
                    <span class="step-dot active"></span>
                    <span class="step-dot"></span>
                </div>
                <h2 class="wizard-title">Seleccione Lista de Junta</h2>
                
                <button class="btn-omitir-wizard" id="btnOmitirConcejales">
                    <i class="fas fa-forward"></i> OMITIR CONCEJALES (Solo Intendente)
                </button>
                
                <button class="btn-back-wizard full-width" id="btnVolverPaso1" style="margin-bottom: 1rem;">
                    <i class="fas fa-arrow-left"></i> Volver a Intendentes
                </button>
                
                <div class="big-buttons-grid">
        `;
        
        if (typeof listasConcejales !== 'undefined' && Object.keys(listasConcejales).length > 0) {
            for (const [lid, info] of Object.entries(listasConcejales)) {
                html += `
                    <button class="btn-big-option btn-lista" data-id="${lid}">
                        <span class="candidate-party">Lista ${lid}</span>
                        <span class="candidate-main-name">${info.nombre}</span>
                    </button>
                `;
            }
        } else {
            html += `<p style="text-align:center; padding:2rem; color:#888;">No hay listas de concejales configuradas.</p>`;
        }
        
        html += `</div></div>`;
        container.innerHTML = html;
        
        document.getElementById('btnOmitirConcejales').onclick = () => {
            transaccionVoto.listaId = null;
            transaccionVoto.concejalObj = null;
            procesarGuardadoVoto(transaccionVoto);
        };
        
        document.getElementById('btnVolverPaso1').onclick = () => {
            mostrarPaso1();
        };
        
        container.querySelectorAll('.btn-lista').forEach(btn => {
            btn.onclick = () => {
                transaccionVoto.listaId = btn.getAttribute('data-id');
                mostrarPaso3();
            };
        });
    }
    
    // --- PASO 3: SELECCIÓN DE CANDIDATO INDIVIDUAL ---
    function mostrarPaso3() {
        const container = document.getElementById("wizardStepContent");
        if (!container) return;
        
        const listaInfo = listasConcejales[transaccionVoto.listaId];
        const candidatos = listaInfo ? listaInfo.candidatos : [];
        
        let html = `
            <div class="wizard-step">
                <div class="wizard-progress">
                    <span class="step-dot active"></span>
                    <span class="step-dot active"></span>
                    <span class="step-dot active"></span>
                </div>
                <div class="wizard-subtitle">Lista ${transaccionVoto.listaId} · ${listaInfo ? listaInfo.nombre : ''}</div>
                <h2 class="wizard-title">Seleccione Opción</h2>
                
                <div class="wizard-action-buttons">
                    <button class="btn-back-wizard" id="btnVolverPaso2">
                        <i class="fas fa-arrow-left"></i> Cambiar Lista
                    </button>
                    <button class="btn-omitir-wizard compact" id="btnOmitirCandidato">
                        <i class="fas fa-forward"></i> Omitir Nombre
                    </button>
                </div>
                
                <div class="big-buttons-grid alternative-scrolling">
        `;
        
        if (candidatos && candidatos.length > 0) {
            candidatos.forEach(c => {
                let concejalId = c.id;
                if (typeof concejalesIndividuales !== 'undefined') {
                    const encontrado = concejalesIndividuales.find(ci => ci.lista === transaccionVoto.listaId && ci.opcion == c.opcion);
                    if (encontrado) concejalId = encontrado.id;
                }
                
                html += `
                    <button class="btn-big-option btn-concejal" data-id="${concejalId}" data-opcion="${c.opcion}" data-nombre="${c.nombre}">
                        <span class="candidate-party">Opción ${c.opcion}</span>
                        <span class="candidate-main-name-small">${c.nombre}</span>
                    </button>
                `;
            });
        } else {
            html += `<p style="text-align:center; padding:2rem; color:#888;">Esta lista no cuenta con candidatos registrados.</p>`;
        }
        
        html += `</div></div>`;
        container.innerHTML = html;
        
        document.getElementById('btnVolverPaso2').onclick = () => {
            mostrarPaso2();
        };
        
        document.getElementById('btnOmitirCandidato').onclick = () => {
            transaccionVoto.concejalObj = { id: `lista_${transaccionVoto.listaId}`, nombre: `Voto de Lista`, lista: transaccionVoto.listaId };
            procesarGuardadoVoto(transaccionVoto);
        };
        
        container.querySelectorAll('.btn-concejal').forEach(btn => {
            btn.onclick = () => {
                transaccionVoto.concejalObj = {
                    id: btn.getAttribute('data-id'),
                    nombre: btn.getAttribute('data-nombre'),
                    lista: transaccionVoto.listaId,
                    opcion: btn.getAttribute('data-opcion')
                };
                procesarGuardadoVoto(transaccionVoto);
            };
        });
    }
    
    // --- PROCESAMIENTO Y RESETEO ---
    async function procesarGuardadoVoto(votoFinal) {
        const overlay = document.getElementById("wizardSuccessOverlay");
        const icon = document.getElementById("successIcon");
        const title = document.getElementById("successMessageTitle");
        const sub = document.getElementById("successMessageSub");
        
        if (overlay) {
            title.innerText = "Registrando voto...";
            sub.innerText = "Guardando en la base de datos...";
            icon.className = "fas fa-spinner fa-spin success-icon";
            overlay.style.display = "flex";
        }
        
        try {
            const localDestino = currentUser.localAsignado || "Mesa Electoral";
            
            await registrarVoto(localDestino, "intendente", votoFinal.intendenteId, 1, currentUser.username);
            
            if (votoFinal.concejalObj) {
                await registrarVoto(
                    localDestino, 
                    "concejal", 
                    votoFinal.concejalObj.id, 
                    1, 
                    currentUser.username, 
                    votoFinal.concejalObj.nombre, 
                    votoFinal.listaId
                );
            }
            
            if (overlay) {
                title.innerText = "¡Voto Registrado!";
                sub.innerText = "Listo para el siguiente elector.";
                icon.className = "fas fa-check-circle success-icon";
            }
            
            setTimeout(() => {
                if (overlay) overlay.style.display = "none";
                mostrarPaso1();
            }, 1000);
            
        } catch (error) {
            console.error("Error al registrar voto:", error);
            if (overlay) overlay.style.display = "none";
            alert("Error de conexión. Por favor presiona la última opción de nuevo.");
            mostrarPaso1();
        }
    }
    
    mostrarPaso1();
}

function renderMisCargas() {
    const tbody = document.getElementById("misCargasBody");
    if(!tbody) return;
    const misCargas = cargas.filter(c => c.usuario === currentUser.username).slice(0,30);
    tbody.innerHTML = misCargas.map(c => `
        <tr>
            <td>${new Date(c.timestamp).toLocaleString()}</td>
            <td>${c.tipo === "intendente" ? "Intendente" : "Concejal"}</td>
            <td class="candidate-name">${c.tipo === "intendente" ? (intendentes.find(i=>i.id===c.candidatoId)?.nombre || c.candidatoId) : (c.concejalNombre || `Lista ${c.listaId}`)}</td>
            <td style="font-weight:bold;">${c.votos}</td>
        </tr>
    `).join("");
}

// -------------------- ESTRUCTURA HTML DEL PANEL ADMIN --------------------
function renderAdminPanel() {
    document.getElementById("adminPanel").innerHTML = `
        <div class="admin-area">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem; margin-bottom:1.5rem;">
                <h2 style="color:white;"><i class="fas fa-chart-bar"></i> Panel Administrador</h2>
                <button id="logoutAdminBtn" class="btn-admin logout-btn"><i class="fas fa-sign-out-alt"></i> Cerrar sesión</button>
            </div>
            <div class="admin-tabs">
                <button class="tab-btn active" data-tab="stats"><i class="fas fa-chart-pie"></i> Resultados</button>
                <button class="tab-btn" data-tab="carga"><i class="fas fa-plus-circle"></i> Carga rápida</button>
                <button class="tab-btn" data-tab="users"><i class="fas fa-users"></i> Usuarios</button>
                <button class="tab-btn" data-tab="logs"><i class="fas fa-list-alt"></i> Registro</button>
            </div>
            <div id="tabStats" class="tab-content active">
                <div class="mini-stats">
                    <div class="stat-card"><i class="fas fa-vote-yea"></i><h3>Votos Intendente</h3><div id="resumenIntendentes"></div></div>
                    <div class="stat-card"><i class="fas fa-users"></i><h3>Votos Concejales</h3><div id="resumenConcejales"></div></div>
                </div>
                <div class="charts-panel">
                    <div class="chart-card"><h3>Intendentes</h3><canvas id="intendentesChart"></canvas></div>
                    <div class="chart-card"><h3>Votos por Lista</h3><canvas id="listasChart"></canvas></div>
                </div>
                <div class="results-section"><h3>Resultados por Local – Intendentes</h3><table class="vote-table"><thead id="intendentesHeader"></thead><tbody id="intendentesBody"></tbody></table></div>
                <div class="results-section"><h3>Resultados por Local – Concejales (por lista)</h3><table class="vote-table"><thead id="listasHeader"></thead><tbody id="listasBody"></tbody></table></div>
                <div class="results-section"><h3>Distribución D'Hondt – Bancas Junta Municipal</h3><div id="dhondtResultado"></div></div>
                <div class="results-section"><h3>Concejales Electos (proyección)</h3><table class="vote-table"><thead><tr><th>#</th><th>Lista</th><th>Candidato</th><th>Votos</th></tr></thead><tbody id="electosBody"></tbody></table></div>
                <div class="results-section"><h3>Detalle de Concejales por Lista</h3><div id="concejalesDetalle"></div></div>
            </div>
            <div id="tabCarga" class="tab-content">
                <div class="admin-quick-vote">
                    <h3>Carga Rápida de Votos</h3>
                    <div class="quick-vote-grid">
                        <select id="adminLocalSelect">${locales.map(l => `<option value="${l}">${l}</option>`).join('')}</select>
                        <select id="adminTipoSelect"><option value="intendente">Intendente</option><option value="concejal">Concejal</option></select>
                        <select id="adminCandidatoSelect"></select>
                        <input type="number" id="adminVotosInput" placeholder="Cantidad" min="1">
                        <button id="adminRegistrarBtn" class="btn-admin">Registrar Votos</button>
                    </div>
                </div>
            </div>
            <div id="tabUsers" class="tab-content">
                <div style="background:white; border-radius:var(--border-radius); padding:1.5rem; color:#1a2e2a;">
                    <h3 style="color:var(--radio-green); margin-bottom:1rem;">Crear Digitador</h3>
                    <div class="form-grid" style="margin-bottom:2rem;">
                        <input type="text" id="newFullName" placeholder="Nombre completo">
                        <input type="text" id="newUsername" placeholder="Usuario">
                        <input type="password" id="newPassword" placeholder="Contraseña">
                        <select id="newUserLocal">${locales.map(l => `<option value="${l}">${l}</option>`).join('')}</select>
                        <button id="createUserBtn" class="btn-admin">Crear Usuario</button>
                    </div>
                    <h3 style="color:var(--radio-green); margin-bottom:1rem;">Usuarios Digitadores</h3>
                    <table class="vote-table"><thead><tr><th>Nombre</th><th>Usuario</th><th>Local</th><th>Acciones</th></tr></thead><tbody id="usersTableBody"></tbody></table>
                </div>
            </div>
            <div id="tabLogs" class="tab-content">
                <div style="background:white; border-radius:var(--border-radius); padding:1.5rem; overflow-x:auto; color:#1a2e2a;">
                    <h3 style="color:var(--radio-green); margin-bottom:1rem;">Registro de Cargas</h3>
                    <table class="vote-table"><thead><tr><th>Fecha/Hora</th><th>Usuario</th><th>Local</th><th>Tipo</th><th>Candidato</th><th>Concejal</th><th>Votos</th></tr></thead><tbody id="allLogsBody"></tbody></table>
                </div>
            </div>
        </div>
    `;
}

function setupAdminEvents() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
            const tabName = btn.getAttribute('data-tab');
            document.getElementById('tab' + tabName.charAt(0).toUpperCase() + tabName.slice(1)).classList.add('active');
            if (tabName === 'logs') renderAllLogs();
            if (tabName === 'users') renderUsersTable();
            if (tabName === 'stats') renderAdminStats();
        });
    });
    
    const adminLocal = document.getElementById("adminLocalSelect");
    const adminTipo = document.getElementById("adminTipoSelect");
    const adminCandidato = document.getElementById("adminCandidatoSelect");
    
    function actualizarAdminSelect() {
        if (adminTipo.value === "intendente") {
            adminCandidato.innerHTML = intendentes.map(i => `<option value="${i.id}">${i.nombre} (${i.lista})</option>`).join('');
        } else {
            let html = '';
            for (const [lid, info] of Object.entries(listasConcejales)) {
                for (let candidato of info.candidatos) {
                    const concejalObj = concejalesIndividuales.find(c => c.lista === lid && c.opcion === candidato.opcion);
                    if (concejalObj) {
                        html += `<option value="${concejalObj.id}" data-lista="${lid}">Lista ${lid} - ${candidato.opcion} — ${candidato.nombre}</option>`;
                    }
                }
            }
            adminCandidato.innerHTML = html;
        }
    }
    adminTipo.addEventListener('change', actualizarAdminSelect);
    actualizarAdminSelect();
    
    document.getElementById("adminRegistrarBtn").onclick = async () => {
        const local = adminLocal.value;
        const tipo = adminTipo.value;
        const votos = parseInt(document.getElementById("adminVotosInput").value);
        if (isNaN(votos) || votos <= 0) { alert("Cantidad inválida"); return; }
        if (tipo === "intendente") {
            const id = adminCandidato.value;
            if (await registrarVoto(local, "intendente", id, votos, currentUser.username)) {
                alert("Voto registrado");
            } else alert("Error");
        } else {
            const selected = adminCandidato.options[adminCandidato.selectedIndex];
            const concejalId = selected.value;
            const listaId = selected.getAttribute("data-lista");
            const concejalNombre = selected.text.split(' — ')[1] || selected.text;
            if (await registrarVoto(local, "concejal", concejalId, votos, currentUser.username, concejalNombre, listaId)) {
                alert("Voto registrado");
            } else alert("Error");
        }
        document.getElementById("adminVotosInput").value = "";
    };
    
    document.getElementById('createUserBtn').addEventListener('click', async () => {
        const fullName = document.getElementById('newFullName').value.trim();
        const username = document.getElementById('newUsername').value.trim();
        const password = document.getElementById('newPassword').value.trim();
        const local = document.getElementById('newUserLocal').value;
        if (!fullName || !username || !password) { alert("Complete todos los campos"); return; }
        const ok = await crearDigitador(fullName, username, password, local);
        if (ok) {
            alert("Digitador creado");
            renderUsersTable();
            document.getElementById('newFullName').value = '';
            document.getElementById('newUsername').value = '';
            document.getElementById('newPassword').value = '';
        }
    });
    
    document.getElementById('logoutAdminBtn').addEventListener('click', logout);
}

// -------------------- LOGIN Y AUTENTICACIÓN --------------------
async function login(username, password) {
    try {
        const normalizedUsername = username.toLowerCase();
        const email = `${normalizedUsername}@bocadeurna.local`;
        
        const userCred = await signInWithEmailAndPassword(auth, email, password);
        let userDoc = await getDoc(doc(db, "users", normalizedUsername));
        
        if (!userDoc.exists() && normalizedUsername === "admin") {
            console.log("Perfil de Admin ausente en Firestore. Recreando automáticamente...");
            await setDoc(doc(db, "users", "admin"), {
                uid: userCred.user.uid,
                username: "Admin",
                fullName: "Administrador",
                role: "admin",
                localAsignado: null
            });
            userDoc = await getDoc(doc(db, "users", normalizedUsername));
        }

        if (userDoc.exists()) {
            const userData = userDoc.data();
            if (userData.disabled) {
                alert("El usuario está deshabilitado.");
                await signOut(auth);
                return;
            }
            currentUser = { ...userData, uid: userCred.user.uid };
            if (currentUser.role === 'admin') {
                renderAdminPanel();
                setupAdminEvents();
                document.getElementById("adminPanel").style.display = "block";
                document.getElementById("digitadorPanel").style.display = "none";
                document.getElementById("floatingLoginBtn").style.display = "none";
                renderAdminStats();
                renderUsersTable();
                renderAllLogs();
            } else {
                renderDigitadorPanel();
                document.getElementById("digitadorPanel").style.display = "block";
                document.getElementById("adminPanel").style.display = "none";
                document.getElementById("floatingLoginBtn").style.display = "none";
                loadDigitadorInterface();
            }
        } else {
            alert("Usuario no registrado en el sistema");
            await signOut(auth);
        }
    } catch (error) {
        console.error(error);
        alert("Credenciales incorrectas");
    }
}

function logout() {
    signOut(auth);
    currentUser = null;
    document.getElementById("adminPanel").style.display = "none";
    document.getElementById("digitadorPanel").style.display = "none";
    document.getElementById("floatingLoginBtn").style.display = "block";
}

function showLoginModal() {
    const modal = document.createElement('div');
    modal.className = 'login-modal';
    modal.innerHTML = `
        <div class="login-card">
            <img src="assets/logo_nasa.png" alt="Logo" class="logo-radio login-logo">
            <h3>Radio Ñasaindy 620AM</h3>
            <p>Sistema de Carga de Votos - San Estanislao</p>
            <input type="text" id="loginUser" placeholder="Usuario">
            <input type="password" id="loginPass" placeholder="Contraseña">
            <button id="loginBtn">Ingresar</button>
            <button id="closeModalBtn">Cancelar</button>
        </div>
    `;
    document.body.appendChild(modal);
    const doLogin = () => {
        const user = document.getElementById('loginUser').value.trim();
        const pass = document.getElementById('loginPass').value;
        if (user && pass) {
            login(user, pass);
            modal.remove();
        } else {
            alert("Ingrese usuario y contraseña");
        }
    };
    document.getElementById('loginBtn').addEventListener('click', doLogin);
    document.getElementById('closeModalBtn').addEventListener('click', () => modal.remove());
    document.getElementById('loginPass').addEventListener('keypress', (e) => { if (e.key === 'Enter') doLogin(); });
}

// -------------------- INICIO Y PERSISTENCIA DE LA APP --------------------
async function startApp() {
    const success = await cargarDatosDesdeCSV();
    if (!success) return;
    await inicializarVotosEnFirestore();
    await crearAdminInicial();
    escucharVotos();
    
    const floatingBtn = document.getElementById('floatingLoginBtn');
    floatingBtn.addEventListener('click', showLoginModal);
    
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            const q = query(collection(db, "users"), where("uid", "==", user.uid));
            const usersSnapshot = await getDocs(q);
            let userData = null;
            
            if (!usersSnapshot.empty) {
                const docSnap = usersSnapshot.docs[0];
                if (!docSnap.data().disabled) {
                    userData = { ...docSnap.data(), uid: user.uid };
                }
            }
            
            if (!userData && user.email === "admin@bocadeurna.local") {
                console.log("Sesión activa detectada pero sin datos. Reconstruyendo documento del Admin...");
                await setDoc(doc(db, "users", "admin"), {
                    uid: user.uid,
                    username: "Admin",
                    fullName: "Administrador",
                    role: "admin",
                    localAsignado: null
                });
                userData = { uid: user.uid, username: "Admin", fullName: "Administrador", role: "admin", localAsignado: null };
            }
            
            if (userData) {
                currentUser = userData;
                if (currentUser.role === 'admin') {
                    renderAdminPanel();
                    setupAdminEvents();
                    document.getElementById("adminPanel").style.display = "block";
                    document.getElementById("digitadorPanel").style.display = "none";
                    document.getElementById("floatingLoginBtn").style.display = "none";
                    renderAdminStats();
                    renderUsersTable();
                    renderAllLogs();
                } else {
                    renderDigitadorPanel();
                    document.getElementById("digitadorPanel").style.display = "block";
                    document.getElementById("adminPanel").style.display = "none";
                    document.getElementById("floatingLoginBtn").style.display = "none";
                    loadDigitadorInterface();
                }
            } else {
                await signOut(auth);
            }
        } else {
            if (currentUser) logout();
        }
    });
}

startApp();
