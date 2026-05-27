import { initializeApp } from "firebase/app";
import { 
    getAuth, 
    setPersistence, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    browserLocalPersistence, 
    signOut, 
    onAuthStateChanged 
} from "firebase/auth";
import { 
    getFirestore, 
    doc, 
    getDoc, 
    setDoc, 
    updateDoc, 
    collection, 
    onSnapshot, 
    runTransaction, 
    query, 
    orderBy, 
    limit, 
    writeBatch, 
    getDocs, 
    where 
} from "firebase/firestore";

// ==========================================================================
// CONFIGURACIÓN DE FIREBASE
// ==========================================================================
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

// Configurar persistencia local
await setPersistence(auth, browserLocalPersistence);

// ==========================================================================
// ESTADO GLOBAL Y DATOS (ESTÁTICOS O CARGADOS DESDE CSV/DB)
// ==========================================================================
let currentUser = null;
let locales = ["Gimnasio Municipal", "Colegio Nacional Sebastián de Yegros", "Esc. Carlos Antonio López"];

// NOTA: Asegúrate de que tu lógica de carga de datos rellene estas variables con esta estructura:
let intendentes = [
    { id: "1", lista: "1", nombre: "Candidato Intendente A", alianza: "Partido del Frente" },
    { id: "2", lista: "2", nombre: "Candidato Intendente B", alianza: "Unión de Ciudadanos" }
];

let listasConcejales = {
    "1": {
        nombre: "Partido del Frente",
        candidatos: [
            { id: "c1_1", opcion: "1", nombre: "Juan Pérez" },
            { id: "c1_2", opcion: "2", nombre: "María Rodríguez" }
        ]
    },
    "2": {
        nombre: "Unión de Ciudadanos",
        candidatos: [
            { id: "c2_1", opcion: "1", nombre: "Carlos Gómez" },
            { id: "c2_2", opcion: "2", nombre: "Ana Martínez" }
        ]
    }
};

let concejalesIndividuales = [
    { lista: "1", opcion: "1", id: "c1_1", nombre: "Juan Pérez" },
    { lista: "1", opcion: "2", id: "c1_2", nombre: "María Rodríguez" },
    { lista: "2", opcion: "1", id: "c2_1", nombre: "Carlos Gómez" },
    { lista: "2", opcion: "2", id: "c2_2", nombre: "Ana Martínez" }
];


// ==========================================================================
// OPERACIONES PRINCIPALES DE BASE DE DATOS (VOTOS Y AUTH)
// ==========================================================================

async function registrarVoto(local, tipo, id, cantidad, usuario, nombre = '', lista = '') {
    // 1. Guardar log de la transacción individual
    const logRef = doc(collection(db, "logsVotos"));
    await setDoc(logRef, {
        local,
        tipo,
        id,
        cantidad,
        usuario,
        nombre,
        lista,
        fecha: new Date()
    });

    // 2. Incremento atómico y transaccional en el consolidado de resultados
    const votoRef = doc(db, "resultados", `${local}_${tipo}_${id}`);
    await runTransaction(db, async (transaction) => {
        const docSnap = await transaction.get(votoRef);
        if (!docSnap.exists()) {
            transaction.set(votoRef, {
                local,
                tipo,
                id,
                nombre,
                lista,
                votos: cantidad
            });
        } else {
            const nuevosVotos = (docSnap.data().votos || 0) + cantidad;
            transaction.update(votoRef, { votos: nuevosVotos });
        }
    });
}

async function logout() {
    try {
        await signOut(auth);
        currentUser = null;
        document.getElementById("adminPanel").style.display = "none";
        document.getElementById("digitadorPanel").style.display = "none";
        document.getElementById("floatingLoginBtn").style.display = "block";
    } catch (error) {
        console.error("Error al cerrar sesión:", error);
    }
}


// ==========================================================================
// PANELS Y LOGICA DEL DIGITADOR - ADAPTADO 100% PARA MÓVILES (WIZARD PASO A PASO)
// ==========================================================================

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
        // Al volver al paso 1, limpiamos cualquier selección anterior
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
        
        // Evento al pulsar sobre un Intendente
        container.querySelectorAll('.btn-intendente').forEach(btn => {
            btn.onclick = () => {
                transaccionVoto.intendenteId = btn.getAttribute('data-id');
                mostrarPaso2(); // Pasa obligatoriamente a Concejales (Listas)
            };
        });
    }
    
    // --- PASO 2: SELECCIÓN DE LISTA DE CONCEJALES (SE PUEDE OMITIR O VOLVER) ---
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
        
        // ACCIÓN: Omitir Concejales por completo (Guarda sólo Intendente)
        document.getElementById('btnOmitirConcejales').onclick = () => {
            transaccionVoto.listaId = null;
            transaccionVoto.concejalObj = null;
            procesarGuardadoVoto(transaccionVoto);
        };
        
        // ACCIÓN: Volver atrás para cambiar de Intendente
        document.getElementById('btnVolverPaso1').onclick = () => {
            mostrarPaso1();
        };
        
        // Evento al pulsar una Lista
        container.querySelectorAll('.btn-lista').forEach(btn => {
            btn.onclick = () => {
                transaccionVoto.listaId = btn.getAttribute('data-id');
                mostrarPaso3(); // Pasa a ver los candidatos nominales de esa lista
            };
        });
    }
    
    // --- PASO 3: SELECCIÓN DE CANDIDATO INDIVIDUAL DE LA LISTA (CON OPCIONES DE CAMBIAR O OMITIR) ---
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
                // Vincular id único desde concejalesIndividuales si existe para asegurar la compatibilidad con tu DB
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
        
        // ACCIÓN: Regresar al paso de listas (Corrige errores de tipeo de forma fluida)
        document.getElementById('btnVolverPaso2').onclick = () => {
            mostrarPaso2();
        };
        
        // ACCIÓN: Omitir candidato (Registra el voto para la Lista completa, sin un concejal en particular)
        document.getElementById('btnOmitirCandidato').onclick = () => {
            transaccionVoto.concejalObj = { id: `lista_${transaccionVoto.listaId}`, nombre: `Voto de Lista`, lista: transaccionVoto.listaId };
            procesarGuardadoVoto(transaccionVoto);
        };
        
        // Evento al pulsar sobre un concejal específico
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
    
    // --- PROCESAMIENTO, GUARDADO TRANSACCIONAL Y RESETEO EN BUCLE ---
    async function procesarGuardadoVoto(votoFinal) {
        const overlay = document.getElementById("wizardSuccessOverlay");
        const icon = document.getElementById("successIcon");
        const title = document.getElementById("successMessageTitle");
        const sub = document.getElementById("successMessageSub");
        
        // Bloquear pantalla con animación de guardado inmediato
        if (overlay) {
            title.innerText = "Registrando voto...";
            sub.innerText = "Guardando en la base de datos...";
            icon.className = "fas fa-spinner fa-spin success-icon";
            overlay.style.display = "flex";
        }
        
        try {
            const localDestino = currentUser.localAsignado || "Mesa Electoral";
            
            // 1. Registrar Intendente (Mandatorio)
            await registrarVoto(localDestino, "intendente", votoFinal.intendenteId, 1, currentUser.username);
            
            // 2. Registrar Concejal (Solo si el flujo no fue omitido)
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
            
            // Mostrar feedback visual de éxito total
            if (overlay) {
                title.innerText = "¡Voto Registrado!";
                sub.innerText = "Listo para el siguiente elector.";
                icon.className = "fas fa-check-circle success-icon";
            }
            
            // Reiniciar automáticamente el bucle después de 1 segundo exacto
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
    
    // Iniciar automáticamente el flujo en el paso 1 al abrir la interfaz
    mostrarPaso1();
}

// ==========================================================================
// VISTAS Y LOGICA DEL ADMINISTRADOR (PANEL DE CONTROL)
// ==========================================================================
function renderAdminPanel() {
    document.getElementById("adminPanel").innerHTML = `
        <div class="admin-container">
            <h2>Panel de Administrador</h2>
            <p>Bienvenido al Centro de Control de Boca de Urna.</p>
            <div id="adminStatsContainer"></div>
            <div id="usersTableContainer"></div>
            <div id="logsContainer"></div>
            <button id="logoutAdminBtn" class="btn-logout">Cerrar Sesión</button>
        </div>
    `;
    document.getElementById("logoutAdminBtn").onclick = logout;
}

function setupAdminEvents() { /* Eventos específicos de Admin */ }
function renderAdminStats() { /* Render de estadísticas en tiempo real */ }
function renderUsersTable() { /* Tabla de gestión de usuarios/digitadores */ }
function renderAllLogs() { /* Historial global de logs */ }


// ==========================================================================
// INICIALIZACIÓN DE LA APLICACIÓN Y OBSERVADOR DE AUTENTICACIÓN
// ==========================================================================
function startApp() {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            let userData = null;
            const userDoc = await getDoc(doc(db, "usuarios", user.uid));
            
            if (userDoc.exists()) {
                userData = userDoc.data();
            } else if (user.email === "admin@bocadeurna.com") { 
                // Cuenta de respaldo inicial en caso de base de datos vacía
                await setDoc(doc(db, "usuarios", user.uid), {
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

// Arrancar la app
startApp();
