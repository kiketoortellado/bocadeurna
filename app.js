import { initializeApp } from "firebase/app";
import { getAuth, setPersistence, signInWithEmailAndPassword, createUserWithEmailAndPassword, browserLocalPersistence, signOut, onAuthStateChanged, reauthenticateWithCredential, EmailAuthProvider } from "firebase/auth";
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

// Configurar persistencia local
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

// -------------------- SISTEMA INTEGRADO DE ESTILOS Y TEMAS (CSS) --------------------
function inyectarEstilosProfesionales() {
    if (document.getElementById("radio-nasa-styles")) return;
    const styleEl = document.createElement("style");
    styleEl.id = "radio-nasa-styles";
    styleEl.textContent = `
        :root {
            --radio-green: #0d523c;
            --radio-green-hover: #073325;
            --radio-green-light: #e6f1ed;
            --radio-fuchsia: #df1660;
            --radio-fuchsia-hover: #b50e4b;
            --radio-fuchsia-light: #fdf2f6;
            --radio-white: #ffffff;
            --radio-bg: #f4f7f6;
            --radio-text: #1e293b;
            --radio-text-muted: #64748b;
            --radio-border: #e2e8f0;
            --shadow-card: 0 10px 25px -5px rgba(13, 82, 60, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.03);
            --shadow-button: 0 4px 14px rgba(13, 82, 60, 0.2);
            --shadow-fuchsia: 0 4px 14px rgba(223, 22, 96, 0.25);
            --shadow-modal: 0 25px 50px -12px rgba(0, 0, 0, 0.15);
            --radius-lg: 20px;
            --radius-md: 14px;
            --radius-sm: 8px;
            --transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        }

        body {
            background-color: var(--radio-bg);
            color: var(--radio-text);
            font-family: 'Inter', system-ui, -apple-system, sans-serif;
            margin: 0; padding: 0;
            -webkit-font-smoothing: antialiased;
        }

        /* Contenedores de Animación Global */
        .admin-area, .digitador-container {
            max-width: 1240px;
            margin: 24px auto;
            padding: 0 16px;
            animation: appFadeIn 0.4s ease-out forwards;
        }

        @keyframes appFadeIn {
            from { opacity: 0; transform: translateY(12px); }
            to { opacity: 1; transform: translateY(0); }
        }

        /* Encabezados Premium */
        .admin-header, .digitador-header {
            background: linear-gradient(135deg, var(--radio-green) 0%, #062b20 100%);
            padding: 24px 32px;
            border-radius: var(--radius-lg);
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap; gap: 16px;
            box-shadow: 0 20px 25px -5px rgba(13, 82, 60, 0.1);
            margin-bottom: 24px;
            border-bottom: 4px solid var(--radio-fuchsia);
        }
        .admin-header h2, .digitador-header h2 {
            margin: 0; color: white;
            display: flex; align-items: center; gap: 12px;
            font-size: 1.5rem; font-weight: 700;
        }

        /* Botones e Interacciones */
        .btn-admin, .logout-btn {
            padding: 10px 20px;
            border-radius: var(--radius-md);
            font-weight: 600; font-size: 0.9rem;
            cursor: pointer; transition: var(--transition);
            display: inline-flex; align-items: center; gap: 8px;
            border: none;
        }
        .logout-btn {
            background: rgba(255, 255, 255, 0.12);
            color: white;
            border: 1px solid rgba(255, 255, 255, 0.2);
        }
        .logout-btn:hover {
            background: var(--radio-fuchsia);
            border-color: var(--radio-fuchsia);
            box-shadow: var(--shadow-fuchsia);
            transform: translateY(-2px);
        }

        /* Pestañas de Navegación */
        .admin-tabs {
            display: flex; gap: 8px;
            margin-bottom: 24px;
            overflow-x: auto; padding-bottom: 6px;
            -webkit-overflow-scrolling: touch;
        }
        .tab-btn {
            background: white; color: var(--radio-text-muted);
            border: 1px solid var(--radio-border);
            padding: 12px 20px; border-radius: var(--radius-md);
            font-weight: 600; font-size: 0.95rem;
            cursor: pointer; transition: var(--transition);
            display: flex; align-items: center; gap: 8px;
            white-space: nowrap; box-shadow: 0 2px 4px rgba(0,0,0,0.02);
        }
        .tab-btn:hover {
            color: var(--radio-green);
            border-color: var(--radio-green);
            background: var(--radio-green-light);
        }
        .tab-btn.active {
            background: var(--radio-green); color: white;
            border-color: var(--radio-green);
            box-shadow: var(--shadow-button);
        }

        /* Vistas de Pestañas */
        .tab-content { display: none; }
        .tab-content.active { display: block; animation: appFadeIn 0.3s ease; }

        /* Tarjetas de Métricas Rápidas */
        .mini-stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 20px; margin-bottom: 24px;
        }
        .stat-card {
            background: white; border-radius: var(--radius-lg);
            padding: 24px; box-shadow: var(--shadow-card);
            display: flex; flex-direction: column; gap: 14px;
            border-top: 5px solid var(--radio-green);
            position: relative; overflow: hidden;
        }
        .stat-card:nth-child(2) { border-top-color: var(--radio-fuchsia); }
        .stat-card h3 {
            font-size: 1.1rem; color: var(--radio-text-muted); margin: 0;
        }
        .stat-card p {
            margin: 0; font-size: 0.95rem;
            display: flex; justify-content: space-between; align-items: center;
            border-bottom: 1px dashed var(--radio-border); padding-bottom: 8px;
        }

        /* Paneles de Gráficos */
        .charts-panel {
            display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
            gap: 24px; margin-bottom: 24px;
        }
        .chart-card {
            background: white; border-radius: var(--radius-lg);
            padding: 24px; box-shadow: var(--shadow-card);
        }
        .chart-card h3 { margin: 0 0 20px 0; color: var(--radio-green); font-size: 1.2rem; }

        /* Secciones de Tablas y Resultados */
        .results-section {
            background: white; border-radius: var(--radius-lg);
            padding: 24px; box-shadow: var(--shadow-card);
            margin-bottom: 24px; overflow-x: auto;
        }
        .results-section h3 { color: var(--radio-green); margin: 0 0 18px 0; font-size: 1.2rem; }

        .vote-table { width: 100%; border-collapse: separate; border-spacing: 0; text-align: left; }
        .vote-table th {
            background: var(--radio-green-light); color: var(--radio-green);
            padding: 14px 16px; font-weight: 700; font-size: 0.9rem;
            border-bottom: 2px solid var(--radio-border);
        }
        .vote-table th:first-child { border-top-left-radius: var(--radius-sm); }
        .vote-table th:last-child { border-top-right-radius: var(--radius-sm); }
        .vote-table td { padding: 14px 16px; border-bottom: 1px solid var(--radio-border); font-size: 0.95rem; }
        .vote-table tr:last-child td { border-bottom: none; }
        .vote-table tr:hover td { background-color: #f8faf9; }
        
        .candidate-name { font-weight: 600; color: var(--radio-text); }
        .total-votes { color: var(--radio-fuchsia); font-weight: 700; }

        /* Formularios y Cargas de Votos (Enfoque Táctil / Mobile-First) */
        .admin-quick-vote, .carga-card {
            background: white; border-radius: var(--radius-lg);
            padding: 24px; box-shadow: var(--shadow-card);
            max-width: 540px; margin: 0 auto 24px;
        }
        .admin-quick-vote h3, .carga-card h3 {
            color: var(--radio-green); margin: 0 0 20px 0; font-size: 1.25rem;
            border-bottom: 2px solid var(--radio-green-light); padding-bottom: 10px;
        }
        
        select, input[type="number"], input[type="text"], input[type="password"] {
            width: 100%; box-sizing: border-box;
            padding: 14px 16px; border: 1px solid var(--radio-border);
            border-radius: var(--radius-md); font-size: 1rem;
            transition: var(--transition); background: #f8fafc; color: var(--radio-text);
            margin-bottom: 14px; -webkit-appearance: none;
        }
        select:focus, input:focus {
            outline: none; border-color: var(--radio-fuchsia); background: white;
            box-shadow: 0 0 0 4px var(--radio-fuchsia-light);
        }
        select:disabled { background: #e2e8f0; color: #94a3b8; cursor: not-allowed; }

        .admin-quick-vote button, .carga-card button, .form-grid button {
            background: var(--radio-green); color: white; border: none;
            padding: 14px; border-radius: var(--radius-md);
            width: 100%; font-weight: 700; font-size: 1rem;
            cursor: pointer; box-shadow: var(--shadow-button); transition: var(--transition);
        }
        .admin-quick-vote button:hover, .carga-card button:hover, .form-grid button:hover {
            background: var(--radio-green-hover); transform: translateY(-2px);
        }

        .form-grid { display: flex; flex-direction: column; gap: 4px; }

        /* Botón Flotante de Acceso */
        #floatingLoginBtn {
            position: fixed; bottom: 24px; right: 24px;
            background: var(--radio-fuchsia); color: white; border: none;
            padding: 14px 24px; border-radius: 50px; font-weight: 600;
            box-shadow: var(--shadow-fuchsia); cursor: pointer;
            display: flex; align-items: center; gap: 8px;
            transition: var(--transition); z-index: 999;
        }
        #floatingLoginBtn:hover {
            background: var(--radio-fuchsia-hover); transform: translateY(-4px);
            box-shadow: 0 8px 24px rgba(223, 22, 96, 0.4);
        }

        /* Modal de Autenticación Moderno */
        .login-modal {
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(13, 82, 60, 0.4); backdrop-filter: blur(12px);
            display: flex; align-items: center; justify-content: center;
            z-index: 2000; padding: 16px;
        }
        .login-card {
            background: var(--radio-white); padding: 32px;
            border-radius: var(--radius-lg); width: 100%; max-width: 380px;
            box-shadow: var(--shadow-modal); text-align: center;
            display: flex; flex-direction: column; gap: 4px;
        }
        .login-logo { max-height: 70px; object-fit: contain; margin: 0 auto 12px; }
        .login-card h3 { color: var(--radio-green); font-size: 1.4rem; margin: 0; }
        .login-card p { color: var(--radio-text-muted); font-size: 0.9rem; margin: 0 0 16px 0; }
        
        /* Contenedor Toast Notificaciones */
        .toast-container {
            position: fixed; bottom: 24px; right: 24px; z-index: 10000;
            display: flex; flex-direction: column; gap: 10px;
            width: calc(100% - 48px); max-width: 360px;
        }
        .toast-card {
            background: white; padding: 14px 18px; border-radius: var(--radius-md);
            box-shadow: 0 10px 30px rgba(0,0,0,0.08); display: flex; align-items: center;
            gap: 12px; color: var(--radio-text); font-weight: 500; font-size: 0.95rem;
            border-left: 5px solid #64748b; animation: toastIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .toast-card.success { border-left-color: #10b981; }
        .toast-card.error { border-left-color: var(--radio-fuchsia); }
        .toast-card.warning { border-left-color: #f59e0b; }
        .toast-card.info { border-left-color: var(--radio-green); }
        
        @keyframes toastIn { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes toastOut { to { opacity: 0; transform: translateY(-12px); } }

        /* Spinner de carga */
        .spinner {
            width: 44px; height: 44px;
            border: 4px solid rgba(255,255,255,0.15); border-top-color: var(--radio-fuchsia);
            border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 14px;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        .detalle-sin-bordes { width: 100%; font-size: 0.85rem; border-collapse: collapse; }
        .detalle-sin-bordes th { text-align: left; color: var(--radio-text-muted); padding: 6px 2px; border-bottom: 1px solid var(--radio-border); }
        .detalle-sin-bordes td { padding: 8px 2px; border-bottom: 1px dashed rgba(0,0,0,0.04); }

        /* Adaptabilidad Móvil */
        @media (max-width: 600px) {
            .admin-header, .digitador-header { padding: 20px; border-radius: var(--radius-md); }
            .toast-container { bottom: 16px; right: 16px; left: 16px; width: auto; }
            .admin-tabs { margin-bottom: 16px; }
            .tab-btn { padding: 10px 16px; font-size: 0.88rem; }
            .results-section, .chart-card, .stat-card { padding: 16px; border-radius: var(--radius-md); }
        }

        /* ===== WIZARD MÓVIL DIGITADOR ===== */
        .mobile-wizard-container {
            min-height: 100vh;
            background: var(--radio-bg);
            display: flex;
            flex-direction: column;
        }
        .mobile-wizard-header {
            background: linear-gradient(135deg, var(--radio-green) 0%, #062b20 100%);
            padding: 14px 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 3px solid var(--radio-fuchsia);
            position: sticky; top: 0; z-index: 100;
        }
        .mobile-local-badge {
            color: white; font-size: 0.95rem; font-weight: 600;
            display: flex; align-items: center; gap: 6px; opacity: 0.92;
        }
        .mobile-logout-btn {
            background: rgba(255,255,255,0.12);
            border: 1px solid rgba(255,255,255,0.25);
            color: white; width: 38px; height: 38px;
            border-radius: 50%; cursor: pointer;
            display: flex; align-items: center; justify-content: center;
            font-size: 1rem; transition: var(--transition);
        }
        .mobile-logout-btn:hover { background: var(--radio-fuchsia); border-color: var(--radio-fuchsia); }
        .wizard-step {
            padding: 20px 16px 100px;
            max-width: 600px; margin: 0 auto;
            width: 100%; box-sizing: border-box;
        }
        .wizard-progress {
            display: flex; gap: 8px;
            justify-content: center; margin-bottom: 20px;
        }
        .step-dot {
            width: 10px; height: 10px; border-radius: 50%;
            background: var(--radio-border); transition: var(--transition);
        }
        .step-dot.active { background: var(--radio-fuchsia); transform: scale(1.2); }
        .wizard-title {
            font-size: 1.35rem; font-weight: 700;
            color: var(--radio-green); text-align: center; margin: 0 0 18px 0;
        }
        .wizard-subtitle {
            text-align: center; font-size: 0.88rem;
            color: var(--radio-text-muted); margin-bottom: 4px;
        }
        .big-buttons-grid { display: flex; flex-direction: column; gap: 12px; }
        .btn-big-option {
            background: white; border: 2px solid var(--radio-border);
            border-radius: var(--radius-md); padding: 18px 20px;
            text-align: left; cursor: pointer; transition: var(--transition);
            display: flex; flex-direction: column; gap: 4px;
            box-shadow: var(--shadow-card); -webkit-tap-highlight-color: transparent;
        }
        .btn-big-option:hover, .btn-big-option:active {
            border-color: var(--radio-fuchsia); background: var(--radio-fuchsia-light);
            transform: translateY(-2px); box-shadow: var(--shadow-fuchsia);
        }
        .candidate-party {
            font-size: 0.78rem; font-weight: 700; color: var(--radio-fuchsia);
            text-transform: uppercase; letter-spacing: 0.05em;
        }
        .candidate-main-name { font-size: 1.15rem; font-weight: 700; color: var(--radio-text); }
        .candidate-main-name-small { font-size: 1rem; font-weight: 600; color: var(--radio-text); }
        .candidate-sub { font-size: 0.82rem; color: var(--radio-text-muted); }
        .btn-omitir-wizard {
            background: var(--radio-green-light); border: 2px dashed var(--radio-green);
            color: var(--radio-green); border-radius: var(--radius-md);
            padding: 14px 18px; font-weight: 700; font-size: 0.9rem;
            cursor: pointer; width: 100%; margin-bottom: 10px;
            display: flex; align-items: center; justify-content: center;
            gap: 8px; transition: var(--transition);
        }
        .btn-omitir-wizard:hover { background: var(--radio-green); color: white; }
        .btn-omitir-wizard.compact { padding: 10px 14px; font-size: 0.82rem; width: auto; flex: 1; }
        .btn-back-wizard {
            background: white; border: 1px solid var(--radio-border);
            color: var(--radio-text-muted); border-radius: var(--radius-md);
            padding: 12px 16px; font-weight: 600; font-size: 0.88rem;
            cursor: pointer; display: flex; align-items: center;
            justify-content: center; gap: 6px; transition: var(--transition);
        }
        .btn-back-wizard.full-width { width: 100%; }
        .btn-back-wizard:hover { border-color: var(--radio-green); color: var(--radio-green); }
        .wizard-action-buttons { display: flex; gap: 10px; margin-bottom: 16px; }
        .wizard-action-buttons .btn-back-wizard { flex: 1; }
        .wizard-success-overlay {
            position: fixed; inset: 0;
            background: rgba(13, 82, 60, 0.88); backdrop-filter: blur(8px);
            display: flex; align-items: center; justify-content: center; z-index: 500;
        }
        .success-card {
            background: white; border-radius: var(--radius-lg);
            padding: 40px 32px; text-align: center;
            box-shadow: var(--shadow-modal); max-width: 320px; width: 90%;
            border-top: 5px solid var(--radio-fuchsia);
        }
        .success-icon { font-size: 3.5rem; color: var(--radio-fuchsia); margin-bottom: 16px; display: block; }
        .success-card h2 { color: var(--radio-green); margin: 0 0 8px 0; font-size: 1.5rem; }
        .success-card p { color: var(--radio-text-muted); margin: 0; font-size: 0.95rem; }
    `;
    document.head.appendChild(styleEl);
}

// -------------------- UTILERÍA DE NOTIFICACIONES TOAST --------------------
function mostrarNotificacion(mensaje, tipo = 'info') {
    let container = document.getElementById('app-toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'app-toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast-card ${tipo}`;
    
    let svgIcon = '';
    if (tipo === 'success') {
        svgIcon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    } else if (tipo === 'error') {
        svgIcon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#df1660" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;
    } else if (tipo === 'warning') {
        svgIcon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
    } else {
        svgIcon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0d523c" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
    }

    toast.innerHTML = `${svgIcon}<span style="line-height: 1.3;">${mensaje}</span>`;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'toastOut 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
    }, 4200);
}

// -------------------- ICONOS SVG REUTILIZABLES --------------------
const SVGIcons = {
    chartBar: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>`,
    signOut: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>`,
    chartPie: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"></path><path d="M22 12A10 10 0 0 0 12 2v10z"></path></svg>`,
    plusCircle: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>`,
    users: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>`,
    listAlt: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>`,
    keyboard: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" ry="2"></rect><line x1="6" y1="8" x2="6.01" y2="8"></line><line x1="10" y1="8" x2="10.01" y2="8"></line><line x1="14" y1="8" x2="14.01" y2="8"></line><line x1="18" y1="8" x2="18.01" y2="8"></line><line x1="6" y1="12" x2="6.01" y2="12"></line><line x1="10" y1="12" x2="10.01" y2="12"></line><line x1="14" y1="12" x2="14.01" y2="12"></line><line x1="18" y1="12" x2="18.01" y2="12"></line><line x1="7" y1="16" x2="17" y2="16"></line></svg>`,
    backgroundVote: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="position: absolute; right: 16px; top: 16px; opacity: 0.1; transform: scale(1.6); pointer-events:none;"><polyline points="9 11 12 14 22 4"></polyline><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>`,
    backgroundUsers: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="position: absolute; right: 16px; top: 16px; opacity: 0.1; transform: scale(1.6); pointer-events:none;"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle></svg>`
};

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
    if (overlay) {
        overlay.innerHTML = `
            <div style="text-align: center; color: white;">
                <div class="spinner"></div>
                <p style="font-size: 1.15rem; font-weight: 600; letter-spacing: 0.03em; margin: 0;">Radio Ñasaindy 620AM</p>
                <p style="font-size: 0.85rem; opacity: 0.75; margin: 4px 0 0 0;">Cargando padrón electoral...</p>
            </div>
        `;
    }
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
            overlay.innerHTML = `
                <div style="background: white; padding: 2.5rem; border-radius: var(--radius-lg); text-align: center; box-shadow: var(--shadow-modal); max-width: 400px; border-top: 5px solid var(--radio-fuchsia);">
                    <div style="width: 56px; height: 56px; background: var(--radio-fuchsia-light); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px;">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--radio-fuchsia)" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                    </div>
                    <h3 style="color: var(--radio-green); margin: 0 0 8px 0; font-size: 1.4rem;">Error del Sistema</h3>
                    <p style="color: var(--radio-text-muted); font-size: 0.95rem; margin: 0 0 24px 0; line-height: 1.4;">${error.message}</p>
                    <button class="btn-admin" style="background: var(--radio-fuchsia); color: white; width: 100%; justify-content: center; padding: 12px;" onclick="location.reload()">Reintentar Carga</button>
                </div>
            `;
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

    // Leer todos los documentos en paralelo en lugar de secuencialmente
    const [intSnaps, concSnaps] = await Promise.all([
        Promise.all(locales.map(local => getDoc(doc(db, "intendentes_votes", local)))),
        Promise.all(locales.map(local => getDoc(doc(db, "concejales_votes", local))))
    ]);

    intSnaps.forEach((docSnap, idx) => {
        if (!docSnap.exists()) {
            const initialData = {};
            intendentes.forEach(i => { initialData[i.id] = 0; });
            batch.set(doc(db, "intendentes_votes", locales[idx]), initialData);
        }
    });

    concSnaps.forEach((docSnap, idx) => {
        if (!docSnap.exists()) {
            const initialData = {};
            concejalesIndividuales.forEach(c => { initialData[c.id] = 0; });
            batch.set(doc(db, "concejales_votes", locales[idx]), initialData);
        }
    });

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
// Debounce para evitar doble renderizado cuando disparan ambos snapshots juntos
let _renderStatsTimer = null;
function debouncedRenderAdminStats() {
    clearTimeout(_renderStatsTimer);
    _renderStatsTimer = setTimeout(() => {
        if (currentUser && currentUser.role === 'admin') renderAdminStats();
    }, 80);
}

function escucharVotos() {
    if (listenersActive) return;
    listenersActive = true;
    
    for (let local of locales) {
        const docRef = doc(db, "intendentes_votes", local);
        onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists()) {
                votosIntendentes[local] = docSnap.data();
                debouncedRenderAdminStats();
            }
        });
        
        const docRefConc = doc(db, "concejales_votes", local);
        onSnapshot(docRefConc, (docSnap) => {
            if (docSnap.exists()) {
                votosConcejales[local] = docSnap.data();
                debouncedRenderAdminStats();
            }
        });
    }
    
    const logsQuery = query(collection(db, "logs"), orderBy("timestamp", "desc"), limit(500));
    onSnapshot(logsQuery, (snapshot) => {
        cargas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (currentUser && currentUser.role === 'admin') {
            renderAllLogs();
            const tabCarga = document.getElementById('tabCarga');
            if (tabCarga && tabCarga.classList.contains('active')) {
                renderGestionCargas();
            }
        } else if (currentUser && currentUser.role === 'digitador') {
            renderMisCargas();
        }
    });
}

// -------------------- REGISTRO / SUSTRACCIÓN DE VOTOS (FUNCIÓN UNIFICADA) --------------------
async function registrarOperacionVoto(local, tipo, id, votos, usuario, concejalNombre = null, listaId = null, esSustraccion = false) {
    votos = parseInt(votos);
    if (isNaN(votos) || votos <= 0) return false;
    const coleccion = tipo === "intendente" ? "intendentes_votes" : "concejales_votes";
    try {
        const docRef = doc(db, coleccion, local);
        await runTransaction(db, async (transaction) => {
            const docSnap = await transaction.get(docRef);
            if (!docSnap.exists()) throw new Error("Documento no existe");
            const currentVal = (docSnap.data()[id] || 0);
            const newVal = esSustraccion ? Math.max(0, currentVal - votos) : currentVal + votos;
            transaction.update(docRef, { [id]: newVal });
        });
        const logData = {
            timestamp: new Date().toISOString(),
            usuario,
            local,
            tipo,
            candidatoId: tipo === "intendente" ? id : null,
            listaId: tipo === "concejal" ? listaId : null,
            concejalNombre: tipo === "concejal" ? concejalNombre : null,
            votos
        };
        if (esSustraccion) logData.accion = "sustraccion";
        await setDoc(doc(collection(db, "logs")), logData);
        return true;
    } catch (error) {
        console.error(`Error en ${esSustraccion ? 'sustracción' : 'registro'} de voto:`, error);
        mostrarNotificacion(`Error al ${esSustraccion ? 'sustraer' : 'registrar'} voto en la base de datos.`, "error");
        return false;
    }
}

// Alias para mantener compatibilidad con el código existente
const registrarVoto = (local, tipo, id, votos, usuario, concejalNombre = null, listaId = null) =>
    registrarOperacionVoto(local, tipo, id, votos, usuario, concejalNombre, listaId, false);

const registrarSustraccion = (local, tipo, id, votos, usuario, concejalNombre = null, listaId = null) =>
    registrarOperacionVoto(local, tipo, id, votos, usuario, concejalNombre, listaId, true);

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
    if (!document.getElementById('intendentesHeader')) return; // Panel aún no renderizado
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
                    backgroundColor: ['#0d523c', '#df1660', '#f4a261', '#2c5f8a', '#1e6f5c']
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
                    label: '',
                    data: listaIds.map(l => totalListas[l] || 0),
                    backgroundColor: listaIds.map(l => listasConcejales[l].color),
                    borderRadius: 6
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
        resumenInt.innerHTML = intendentes.map(i => `<p style="color:var(--radio-text);">${i.nombre}: <strong style="color:var(--radio-green);">${totalInt[i.id].toLocaleString()}</strong> (${totalIntSum ? ((totalInt[i.id]/totalIntSum)*100).toFixed(1) : 0}%)</p>`).join('');
    }
    const totalListas = totalVotosPorLista();
    const totalListasSum = Object.values(totalListas).reduce((a,b)=>a+b,0);
    const resumenConc = document.getElementById("resumenConcejales");
    if (resumenConc) {
        resumenConc.innerHTML = Object.keys(listasConcejales).map(lid => `<p style="color:var(--radio-text);">Lista ${lid}: <strong style="color:var(--radio-fuchsia);">${(totalListas[lid]||0).toLocaleString()}</strong> (${totalListasSum ? ((totalListas[lid]/totalListasSum)*100).toFixed(1) : 0}%)</p>`).join('');
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
        fila+=`<td class="total-votes">${sumaLocal.toLocaleString()}</td></tr>`;
        body+=fila;
    });
    const totalG = totalIntendentes();
    let filaTotal = `<tr style="background:var(--radio-green-light); font-weight:bold; color:var(--radio-green);"><td>TOTAL GENERAL</td>`;
    intendentes.forEach(i=>{ filaTotal+=`<td>${totalG[i.id].toLocaleString()}</td>`; });
    filaTotal+=`<td>${(Object.values(totalG).reduce((a,b)=>a+b,0)).toLocaleString()}</td></tr>`;
    tbody.innerHTML = body + filaTotal;
}

function renderTablaListasPorLocal() {
    const thead = document.getElementById("listasHeader");
    const tbody = document.getElementById("listasBody");
    if(!thead) return;
    let header = "<tr><th>Local</th>";
    Object.keys(listasConcejales).forEach(lid=>{ header+=`<th>Lista ${lid}<br><small style="font-weight:normal;opacity:0.8;">${listasConcejales[lid].nombre}</small></th>`; });
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
        fila+=`<td class="total-votes">${sumaLocal.toLocaleString()}</td></tr>`;
        body+=fila;
    });
    const totalL = totalVotosPorLista();
    let sumaTotal=0;
    let filaTotal="<tr style='background:var(--radio-green-light); font-weight:bold; color:var(--radio-green);'><td>TOTAL GENERAL</td>";
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
            <td><strong>Lista ${lid}</strong><br><small style="color:var(--radio-text-muted);">${listasConcejales[lid].nombre}</small></td>
            <td>${votosPorLista[lid].toLocaleString()}</td>
            <td style="font-weight:700; color:var(--radio-fuchsia); font-size:1.15rem;">${bancasPorLista[lid]||0}</td>
        </tr>`;
    }
    html += `</tbody></table>`;
    container.innerHTML = html;
}

function renderElectos(electos) {
    const electosBody = document.getElementById("electosBody");
    if (electosBody) {
        electosBody.innerHTML = electos.map((c, idx) => `
            <tr>
                <td style="font-weight:bold; color:var(--radio-text-muted);">${idx+1}°</td>
                <td><span style="background:${obtenerColorParaLista(c.lista)}; color:white; padding:2px 8px; border-radius:4px; font-weight:bold; font-size:0.8rem;">Lista ${c.lista}</span></td>
                <td class="candidate-name">${c.nombre} <small style="font-weight:normal; color:var(--radio-text-muted);"> (Opción ${c.opcion})</small></td>
                <td style="font-weight:700; color:var(--radio-green);">${c.votos.toLocaleString()}</td>
            </tr>
        `).join('');
    }
}

function renderDetalleConcejales(candidatosPorListaOriginal) {
    const container = document.getElementById("concejalesDetalle");
    if (!container) return;
    let html = `<div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap:1.25rem;">`;
    for (const [lid, candidatos] of Object.entries(candidatosPorListaOriginal)) {
        const listaInfo = listasConcejales[lid];
        html += `<div style="background:white; border-radius:var(--radius-md); padding:1.25rem; border-top:5px solid ${listaInfo.color}; box-shadow: var(--shadow-card);">
            <h4 style="color:var(--radio-green); margin:0 0 4px 0; font-size:1.1rem;">Lista ${lid}</h4>
            <p style="font-size:0.8rem; color:var(--radio-text-muted); margin:0 0 10px 0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${listaInfo.nombre}</p>
            <p style="font-size:0.9rem; margin:0 0 12px 0; padding-bottom:6px; border-bottom:1px solid var(--radio-border);"><strong>Total:</strong> <span style="color:var(--radio-fuchsia); font-weight:bold;">${candidatos.reduce((sum,c)=>sum+c.votos,0).toLocaleString()}</span></p>
            <table class="detalle-sin-bordes">
                <thead><tr><th>N°</th><th>Candidato</th><th style="text-align:right;">Votos</th></tr></thead>
                <tbody>`;
        candidatos.forEach(c => {
            html += `<tr><td style="color:var(--radio-text-muted); width:20px;">${c.opcion}</td><td style="font-weight:500;">${c.nombre}</td><td style="text-align:right; font-weight:700; color:var(--radio-green);">${c.votos.toLocaleString()}</td></tr>`;
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
        mostrarNotificacion(error.message, "error");
        return false;
    }
}

async function eliminarDigitador(username) {
    if(confirm(`¿Está seguro de deshabilitar al usuario de carga: ${username}?`)){
        await setDoc(doc(db, "users", username.toLowerCase()), { disabled: true }, { merge: true });
        mostrarNotificacion(`Usuario ${username} dado de baja de forma segura.`, "info");
        renderUsersTable();
    }
}

async function cambiarPasswordDigitador(username, newPass) {
    mostrarNotificacion("Para cambiar contraseñas de forma segura, utilice la consola oficial de Firebase Auth.", "warning");
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
            <td class="candidate-name">${u.fullName}</td>
            <td style="color:var(--radio-text-muted); font-family:monospace;">${u.username}</td>
            <td><span style="background:var(--radio-green-light); color:var(--radio-green); padding:4px 8px; border-radius:4px; font-size:0.85rem; font-weight:600;">${u.localAsignado}</span></td>
            <td>
                <button class="edit-password-btn" data-user="${u.username}" style="background:#f4a261; border:none; color:white; padding:0.4rem 0.8rem; border-radius:var(--radius-sm); cursor:pointer; font-weight:bold; font-size:0.8rem; margin-right:4px;">Contraseña</button>
                <button class="delete-user-btn" data-user="${u.username}" style="background:var(--radio-fuchsia); border:none; color:white; padding:0.4rem 0.8rem; border-radius:var(--radius-sm); cursor:pointer; font-weight:bold; font-size:0.8rem;">Eliminar</button>
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
    tbody.innerHTML = cargas.slice(0,200).map(c => {
        const esSustraccion = c.accion === 'sustraccion';
        const votosDisplay = esSustraccion
            ? `<span style="color:var(--radio-fuchsia); font-weight:700;">−${Math.abs(c.votos)}</span>`
            : `<span style="color:var(--radio-green); font-weight:700;">+${c.votos}</span>`;
        const accionBadge = esSustraccion
            ? `<span style="background:#fdf2f6; color:var(--radio-fuchsia); padding:2px 8px; border-radius:4px; font-size:0.78rem; font-weight:700;">SUSTRACCIÓN</span>`
            : `<span style="background:var(--radio-green-light); color:var(--radio-green); padding:2px 8px; border-radius:4px; font-size:0.78rem; font-weight:700;">CARGA</span>`;
        return `
        <tr style="${esSustraccion ? 'background:#fff8f9;' : ''}">
            <td style="color:var(--radio-text-muted); font-size:0.85rem;">${new Date(c.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'})}</td>
            <td style="font-weight:600;">${c.usuario}</td>
            <td style="font-size:0.85rem;">${c.local}</td>
            <td><span style="font-size:0.8rem; padding:2px 6px; border-radius:4px; font-weight:bold; ${c.tipo === "intendente" ? 'background:var(--radio-green-light); color:var(--radio-green);':'background:var(--radio-fuchsia-light); color:var(--radio-fuchsia);'}">${c.tipo === "intendente" ? "Intendente" : "Concejal"}</span></td>
            <td class="candidate-name">${c.candidatoId ? (intendentes.find(i=>i.id===c.candidatoId)?.nombre || c.candidatoId) : (c.listaId ? `Lista ${c.listaId}` : '')}</td>
            <td>${c.concejalNombre || '-'}</td>
            <td style="text-align:right;">${votosDisplay}</td>
            <td>${accionBadge}</td>
        </tr>
    `}).join("");
}

// -------------------- GESTIÓN DE CARGAS (ADMIN: VER Y ANULAR) --------------------
function renderGestionCargas() {
    const tbody = document.getElementById("gestionCargasBody");
    if (!tbody) return;

    const filtroLocal  = document.getElementById("gestionFiltroLocal")?.value  || '';
    const filtroTipo   = document.getElementById("gestionFiltroTipo")?.value   || '';
    const filtroAccion = document.getElementById("gestionFiltroAccion")?.value || '';

    let lista = cargas.slice(0, 500);
    if (filtroLocal)  lista = lista.filter(c => c.local === filtroLocal);
    if (filtroTipo)   lista = lista.filter(c => c.tipo === filtroTipo);
    if (filtroAccion === 'carga')      lista = lista.filter(c => c.accion !== 'sustraccion');
    if (filtroAccion === 'sustraccion') lista = lista.filter(c => c.accion === 'sustraccion');

    if (lista.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:24px; color:var(--radio-text-muted);">No hay registros para los filtros seleccionados.</td></tr>`;
        return;
    }

    tbody.innerHTML = lista.map(c => {
        const esSustraccion = c.accion === 'sustraccion';
        const candidatoLabel = c.candidatoId
            ? (intendentes.find(i => i.id === c.candidatoId)?.nombre || c.candidatoId)
            : (c.concejalNombre || (c.listaId ? `Lista ${c.listaId}` : '-'));
        const votosDisplay = esSustraccion
            ? `<span style="color:var(--radio-fuchsia); font-weight:700;">−${Math.abs(c.votos)}</span>`
            : `<span style="color:var(--radio-green); font-weight:700;">+${c.votos}</span>`;
        const estadoBadge = esSustraccion
            ? `<span style="background:#fdf2f6; color:var(--radio-fuchsia); padding:3px 10px; border-radius:20px; font-size:0.78rem; font-weight:700; white-space:nowrap;">ANULADA</span>`
            : `<span style="background:var(--radio-green-light); color:var(--radio-green); padding:3px 10px; border-radius:20px; font-size:0.78rem; font-weight:700; white-space:nowrap;">VIGENTE</span>`;
        const tipoBadge = `<span style="font-size:0.8rem; padding:2px 6px; border-radius:4px; font-weight:bold; ${c.tipo === "intendente" ? 'background:var(--radio-green-light); color:var(--radio-green);' : 'background:var(--radio-fuchsia-light); color:var(--radio-fuchsia);'}">${c.tipo === "intendente" ? "Intendente" : "Concejal"}</span>`;

        const puedeAnular = !esSustraccion && c.id;
        const btnAnular = puedeAnular
            ? `<button class="btn-anular-carga" data-id="${c.id}" data-local="${c.local}" data-tipo="${c.tipo}" data-candidato="${c.candidatoId || ''}" data-lista="${c.listaId || ''}" data-concejal="${c.concejalNombre || ''}" data-votos="${c.votos}" style="background:var(--radio-fuchsia); color:white; border:none; padding:5px 14px; border-radius:var(--radius-sm); font-size:0.82rem; font-weight:700; cursor:pointer; white-space:nowrap;">Anular</button>`
            : `<span style="color:var(--radio-text-muted); font-size:0.82rem;">—</span>`;

        return `
        <tr style="${esSustraccion ? 'opacity:0.6; background:#fff8f9;' : ''}">
            <td style="color:var(--radio-text-muted); font-size:0.83rem; white-space:nowrap;">${new Date(c.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', second:'2-digit'})}</td>
            <td style="font-weight:600; font-size:0.9rem;">${c.usuario}</td>
            <td style="font-size:0.85rem;">${c.local}</td>
            <td>${tipoBadge}</td>
            <td class="candidate-name" style="font-size:0.88rem;">${candidatoLabel}</td>
            <td style="text-align:right;">${votosDisplay}</td>
            <td>${estadoBadge}</td>
            <td>${btnAnular}</td>
        </tr>`;
    }).join('');

    tbody.querySelectorAll('.btn-anular-carga').forEach(btn => {
        btn.addEventListener('click', async () => {
            const local      = btn.dataset.local;
            const tipo       = btn.dataset.tipo;
            const candidato  = btn.dataset.candidato;
            const listaId    = btn.dataset.lista;
            const concejal   = btn.dataset.concejal;
            const votos      = parseInt(btn.dataset.votos);
            const nombreDisplay = tipo === 'intendente'
                ? (intendentes.find(i => i.id === candidato)?.nombre || candidato)
                : (concejal || `Lista ${listaId}`);

            if (!confirm(`¿Anular esta carga?\n\n• ${tipo === 'intendente' ? 'Intendente' : 'Concejal'}: ${nombreDisplay}\n• Local: ${local}\n• Votos: ${votos}\n\nSe restará del conteo y quedará registrado en la Auditoría de Carga.`)) return;

            btn.disabled = true;
            btn.textContent = '...';

            let ok = false;
            if (tipo === 'intendente') {
                ok = await registrarSustraccion(local, 'intendente', candidato, votos, currentUser.username);
            } else {
                ok = await registrarSustraccion(local, 'concejal', candidato, votos, currentUser.username, concejal || null, listaId || null);
            }

            if (ok) {
                mostrarNotificacion(`Carga anulada correctamente. Registrado en Auditoría.`, 'warning');
            } else {
                mostrarNotificacion('Error al anular la carga. Intente nuevamente.', 'error');
                btn.disabled = false;
                btn.textContent = 'Anular';
            }
        });
    });
}

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
    document.getElementById("digitadorPanel").style.display = "block";
    document.getElementById("adminPanel").style.display = "none";
    
    const miLocalSpan = document.getElementById("miLocalSpan");
    if (miLocalSpan && currentUser) {
        miLocalSpan.innerText = currentUser.localAsignado || "Local Asignado";
    }
    
    const logoutDigitadorBtn = document.getElementById('logoutDigitadorBtn');
    if (logoutDigitadorBtn) {
        logoutDigitadorBtn.onclick = logout;
    }
    
    let transaccionVoto = {
        intendenteId: null,
        listaId: null,
        concejalObj: null
    };
    
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
                
                <div style="margin-bottom: 1rem;">
                    <button class="btn-back-wizard full-width" id="btnVolverPaso2">
                        <i class="fas fa-arrow-left"></i> Volver a Listas
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
            mostrarNotificacion("Error de conexión. Por favor intentá de nuevo.", "error");
            mostrarPaso1();
        }
    }
    
    mostrarPaso1();
}

function renderMisCargas() {
    const tbody = document.getElementById("misCargasBody");
    if (!tbody || !currentUser) return;
    const misCargas = cargas.filter(c => c.usuario === currentUser.username).slice(0,30);
    if(misCargas.length === 0){
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--radio-text-muted); font-size:0.9rem; padding:20px;">Ninguna carga enviada aún en esta jornada.</td></tr>`;
        return;
    }
    tbody.innerHTML = misCargas.map(c => `
        <tr>
            <td style="color:var(--radio-text-muted); font-size:0.85rem;">${new Date(c.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</td>
            <td><span style="font-size:0.8rem; padding:2px 6px; border-radius:4px; font-weight:bold; ${c.tipo === "intendente" ? 'background:var(--radio-green-light); color:var(--radio-green);':'background:var(--radio-fuchsia-light); color:var(--radio-fuchsia);'}">${c.tipo === "intendente" ? "Intendente" : "Junta"}</span></td>
            <td class="candidate-name">${c.tipo === "intendente" ? (intendentes.find(i=>i.id===c.candidatoId)?.nombre || c.candidatoId) : (c.concejalNombre || `Lista ${c.listaId}`)}</td>
            <td style="font-weight:700; color:var(--radio-green); text-align:right;">+${c.votos}</td>
        </tr>
    `).join("");
}

// -------------------- BORRAR HISTORIAL COMPLETO --------------------
async function borrarHistorialCompleto() {
    if (!confirm("⚠️ ¿ESTÁS SEGURO?\n\nEsta acción ELIMINARÁ PERMANENTEMENTE TODOS los registros de auditoría (cargas y anulaciones).\n\nNo se puede deshacer. ¿Continuar?")) {
        return;
    }
    
    mostrarNotificacion("Eliminando historial... Por favor espere.", "info");
    
    try {
        const logsCollection = collection(db, "logs");
        const querySnapshot = await getDocs(logsCollection);
        
        if (querySnapshot.empty) {
            mostrarNotificacion("No hay registros para eliminar.", "info");
            return;
        }
        
        // Firestore limita a 500 operaciones por batch — fragmentar si es necesario
        const CHUNK = 499;
        const docs = querySnapshot.docs;
        let count = 0;
        
        for (let i = 0; i < docs.length; i += CHUNK) {
            const batch = writeBatch(db);
            docs.slice(i, i + CHUNK).forEach(d => { batch.delete(d.ref); count++; });
            await batch.commit();
        }
        
        mostrarNotificacion(`✅ Historial borrado exitosamente. Se eliminaron ${count} registros.`, "success");
        
        if (currentUser && currentUser.role === 'admin') {
            renderAllLogs();
            renderGestionCargas();
        }
        
    } catch (error) {
        console.error("Error al borrar historial:", error);
        mostrarNotificacion("❌ Error al borrar el historial: " + error.message, "error");
    }
}

// -------------------- REINICIAR CONTADORES (VOTOS A CERO) --------------------
async function reiniciarContadores() {
    if (!confirm("⚠️ ATENCIÓN: Esta acción PONDRÁ TODOS LOS VOTOS A CERO (intendentes y concejales) en TODOS los locales.\n\n¿Estás seguro de continuar?")) {
        return;
    }

    const password = prompt("🔐 Para confirmar, ingrese su contraseña de administrador:");
    if (!password) {
        mostrarNotificacion("Operación cancelada: no se ingresó contraseña.", "warning");
        return;
    }

    const user = auth.currentUser;
    if (!user || !user.email) {
        mostrarNotificacion("No hay sesión de administrador activa.", "error");
        return;
    }

    mostrarNotificacion("Verificando credenciales...", "info");

    try {
        const credential = EmailAuthProvider.credential(user.email, password);
        await reauthenticateWithCredential(user, credential);
        
        mostrarNotificacion("Contraseña verificada. Reiniciando contadores...", "info");

        // Leer todos los documentos en paralelo
        const [intSnaps, concSnaps] = await Promise.all([
            Promise.all(locales.map(local => getDoc(doc(db, "intendentes_votes", local)))),
            Promise.all(locales.map(local => getDoc(doc(db, "concejales_votes", local))))
        ]);

        const batch = writeBatch(db);

        intSnaps.forEach((docSnap, idx) => {
            if (docSnap.exists()) {
                const updates = {};
                for (let key in docSnap.data()) updates[key] = 0;
                batch.update(doc(db, "intendentes_votes", locales[idx]), updates);
            }
        });

        concSnaps.forEach((docSnap, idx) => {
            if (docSnap.exists()) {
                const updates = {};
                for (let key in docSnap.data()) updates[key] = 0;
                batch.update(doc(db, "concejales_votes", locales[idx]), updates);
            }
        });

        await batch.commit();

        await setDoc(doc(collection(db, "logs")), {
            timestamp: new Date().toISOString(),
            usuario: currentUser.username,
            local: "TODOS",
            tipo: "SISTEMA",
            candidatoId: null,
            listaId: null,
            concejalNombre: null,
            votos: 0,
            accion: "RESETEO_COMPLETO"
        });

        mostrarNotificacion("✅ Todos los contadores han sido reiniciados a cero.", "success");
        
        if (currentUser && currentUser.role === 'admin') {
            renderAdminStats();
            renderGestionCargas();
            renderAllLogs();
        }
        
    } catch (error) {
        console.error("Error al reautenticar o resetear:", error);
        if (error.code === 'auth/wrong-password') {
            mostrarNotificacion("❌ Contraseña incorrecta. Operación cancelada.", "error");
        } else {
            mostrarNotificacion("❌ Error al reiniciar contadores: " + error.message, "error");
        }
    }
}

// -------------------- ESTRUCTURA HTML DEL PANEL ADMIN --------------------
function renderAdminPanel() {
    document.getElementById("adminPanel").innerHTML = `
        <div class="admin-area">
            <div class="admin-header">
                <h2>${SVGIcons.chartBar} Panel de Monitoreo - Administrador</h2>
                <button id="logoutAdminBtn" class="btn-admin logout-btn">${SVGIcons.signOut} Cerrar Sesión</button>
            </div>
            <div class="admin-tabs">
                <button class="tab-btn active" data-tab="stats">${SVGIcons.chartPie} Resultados en Vivo</button>
                <button class="tab-btn" data-tab="carga">${SVGIcons.plusCircle} Gestión de Carga</button>
                <button class="tab-btn" data-tab="users">${SVGIcons.users} Gestión de Digitadores</button>
                <button class="tab-btn" data-tab="logs">${SVGIcons.listAlt} Auditoría de Carga</button>
            </div>
            <div id="tabStats" class="tab-content active">
                <div class="mini-stats">
                    <div class="stat-card">${SVGIcons.backgroundVote}<h3>Cómputo General Intendentes</h3><div id="resumenIntendentes"></div></div>
                    <div class="stat-card">${SVGIcons.backgroundUsers}<h3>Cómputo Proporcional Concejales</h3><div id="resumenConcejales"></div></div>
                </div>
                <div class="charts-panel">
                    <div class="chart-card"><h3>Participación / Intendentes</h3><div style="position:relative; width:100%; max-width:320px; margin:0 auto;"><canvas id="intendentesChart"></canvas></div></div>
                    <div class="chart-card"><h3>Tendencia Global de Votos por Lista</h3><canvas id="listasChart"></canvas></div>
                </div>
                <div class="results-section"><h3>Resultados por Local – Intendentes</h3><table class="vote-table"><thead id="intendentesHeader"></thead><tbody id="intendentesBody"></tbody></table></div>
                <div class="results-section"><h3>Resultados por Local – Concejales (Por Lista)</h3><table class="vote-table"><thead id="listasHeader"></thead><tbody id="listasBody"></tbody></table></div>
                <div class="results-section"><h3>Distribución D'Hondt – Bancas Junta Municipal (12 total)</h3><div id="dhondtResultado"></div></div>
                <div class="results-section"><h3>Concejales Electos (Proyección Oficial Ordenada)</h3><table class="vote-table"><thead><tr><th># Banca</th><th>Lista</th><th>Candidato Municipal</th><th>Votos Acumulados</th></tr></thead><tbody id="electosBody"></tbody></table></div>
                <div class="results-section"><h3>Detalle de Votos Preferenciales por Candidato</h3><div id="concejalesDetalle"></div></div>
            </div>
            <div id="tabCarga" class="tab-content">
                <div style="background:white; border-radius:var(--radius-lg); padding:24px; box-shadow:var(--shadow-card); margin-bottom:16px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:18px;">
                        <h3 style="color:var(--radio-green); margin:0;">Gestión de Cargas de Digitadores</h3>
                        <div style="display:flex; gap:10px;">
                            <span style="font-size:0.82rem; color:var(--radio-text-muted); background:var(--radio-green-light); padding:6px 14px; border-radius:20px;">
                                <i class="fas fa-info-circle"></i> Solo digitadores pueden agregar votos. El admin puede anular cargas erróneas.
                            </span>
                            <button id="resetCountersBtn" class="btn-clear-history" style="background:#d9534f;">
                                <i class="fas fa-sync-alt"></i> Reiniciar contadores
                            </button>
                        </div>
                    </div>
                    <div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:16px;">
                        <select id="gestionFiltroLocal" style="flex:1; min-width:160px; padding:10px 14px; border:1px solid var(--radio-border); border-radius:var(--radius-md); font-size:0.9rem; background:#f8fafc; color:var(--radio-text);">
                            <option value="">Todos los locales</option>
                            ${locales.map(l => `<option value="${l}">${l}</option>`).join('')}
                        </select>
                        <select id="gestionFiltroTipo" style="flex:1; min-width:140px; padding:10px 14px; border:1px solid var(--radio-border); border-radius:var(--radius-md); font-size:0.9rem; background:#f8fafc; color:var(--radio-text);">
                            <option value="">Todos los tipos</option>
                            <option value="intendente">Intendente</option>
                            <option value="concejal">Concejal</option>
                        </select>
                        <select id="gestionFiltroAccion" style="flex:1; min-width:140px; padding:10px 14px; border:1px solid var(--radio-border); border-radius:var(--radius-md); font-size:0.9rem; background:#f8fafc; color:var(--radio-text);">
                            <option value="">Todas las acciones</option>
                            <option value="carga">Solo cargas</option>
                            <option value="sustraccion">Solo anulaciones</option>
                        </select>
                    </div>
                    <div style="overflow-x:auto;">
                        <table class="vote-table" id="gestionCargasTable">
                            <thead>
                                <tr>
                                    <th>Hora</th>
                                    <th>Digitador</th>
                                    <th>Local</th>
                                    <th>Tipo</th>
                                    <th>Candidato / Concejal</th>
                                    <th style="text-align:right;">Votos</th>
                                    <th>Estado</th>
                                    <th>Acción Admin</th>
                                </tr>
                            </thead>
                            <tbody id="gestionCargasBody"></tbody>
                        </table>
                    </div>
                </div>
            </div>
            <div id="tabUsers" class="tab-content">
                <div style="background:white; border-radius:var(--radius-lg); padding:24px; box-shadow:var(--shadow-card);">
                    <h3 style="color:var(--radio-green); margin-bottom:1rem;">Crear Nuevo Digitador</h3>
                    <div class="form-grid" style="margin-bottom:2.5rem;">
                        <input type="text" id="newFullName" placeholder="Nombre completo">
                        <input type="text" id="newUsername" placeholder="Usuario de acceso">
                        <input type="password" id="newPassword" placeholder="Contraseña segura">
                        <select id="newUserLocal" style="margin-bottom:20px;">${locales.map(l => `<option value="${l}">${l}</option>`).join('')}</select>
                        <button id="createUserBtn" class="btn-admin">Dar de Alta en Firebase</button>
                    </div>
                    <h3 style="color:var(--radio-green); margin-bottom:1rem;">Nómina de Digitadores Asignados</h3>
                    <table class="vote-table"><thead><tr><th>Nombre</th><th>Usuario</th><th>Local Electoral</th><th>Acciones</th></tr></thead><tbody id="usersTableBody"></tbody></table>
                </div>
            </div>
            <div id="tabLogs" class="tab-content">
                <div class="results-section">
                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; margin-bottom: 1rem;">
                        <h3 style="margin: 0;">Auditoría de Carga</h3>
                        <button id="clearHistoryBtn" class="btn-clear-history">
                            <i class="fas fa-trash-alt"></i> Borrar todo el historial
                        </button>
                    </div>
                    <table class="vote-table">
                        <thead>
                            <tr><th>Hora</th><th>Usuario</th><th>Local</th><th>Módulo</th><th>Candidato / Lista</th><th>Concejal</th><th style="text-align:right;">Votos</th><th>Acción</th></tr>
                        </thead>
                        <tbody id="allLogsBody"></tbody>
                    </table>
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
            if (tabName === 'carga') renderGestionCargas();
        });
    });

    ['gestionFiltroLocal','gestionFiltroTipo','gestionFiltroAccion'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', renderGestionCargas);
    });

    document.getElementById('createUserBtn').addEventListener('click', async () => {
        const fullName = document.getElementById('newFullName').value.trim();
        const username = document.getElementById('newUsername').value.trim();
        const password = document.getElementById('newPassword').value.trim();
        const local = document.getElementById('newUserLocal').value;
        if (!fullName || !username || !password) { 
            mostrarNotificacion("Por favor complete todos los campos de registro", "warning"); 
            return; 
        }
        const ok = await crearDigitador(fullName, username, password, local);
        if (ok) {
            mostrarNotificacion(`Digitador ${username} configurado en el sistema con éxito`, "success");
            renderUsersTable();
            document.getElementById('newFullName').value = '';
            document.getElementById('newUsername').value = '';
            document.getElementById('newPassword').value = '';
        }
    });
    
    document.getElementById('logoutAdminBtn').addEventListener('click', logout);

    const clearBtn = document.getElementById('clearHistoryBtn');
    if (clearBtn) {
        clearBtn.addEventListener('click', borrarHistorialCompleto);
    }

    const resetBtn = document.getElementById('resetCountersBtn');
    if (resetBtn) {
        resetBtn.addEventListener('click', reiniciarContadores);
    }
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
                mostrarNotificacion("Este operador ha sido suspendido del sistema.", "error");
                await signOut(auth);
                return;
            }
            
            localStorage.setItem('inicio_sesion_timestamp', Date.now().toString());
            currentUser = { ...userData, uid: userCred.user.uid };
            
            mostrarNotificacion(`¡Bienvenido al sistema, ${currentUser.fullName}!`, "success");

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
            mostrarNotificacion("Su cuenta no cuenta con permisos para este sistema.", "error");
            await signOut(auth);
        }
    } catch (error) {
        console.error(error);
        mostrarNotificacion("Credenciales incorrectas. Verifique e intente de nuevo.", "error");
    }
}

function logout() {
    signOut(auth);
    currentUser = null;
    localStorage.removeItem('inicio_sesion_timestamp');
    
    mostrarNotificacion("Sesión cerrada de forma segura.", "info");
    
    document.getElementById("adminPanel").style.display = "none";
    document.getElementById("digitadorPanel").style.display = "none";
    setTimeout(() => {
        if (!document.querySelector('.login-modal')) showLoginModal();
    }, 400);
}

function showLoginModal() {
    const modal = document.createElement('div');
    modal.className = 'login-modal';
    modal.innerHTML = `
        <div class="login-card" style="animation: appFadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;">
            <img src="assets/logo_nasa.png" alt="Logo Radio Ñasaindy"
                 style="display:block;max-height:110px;width:auto;object-fit:contain;margin:0 auto 16px;"
                 onerror="this.style.display='none'">
            <h3 style="font-size:1.5rem;font-weight:800;">Radio Ñasaindy 620AM</h3>
            <p style="font-weight:600;color:#d81b60;font-size:0.9rem;margin:0 0 4px 0;">Boca de Urna Electrónica – San Estanislao</p>
            <p style="color:#64748b;font-size:0.8rem;margin:0 0 16px 0;">Elecciones Municipales 2026</p>
            <input type="text" id="loginUser" placeholder="Usuario Operador" autocomplete="username">
            <input type="password" id="loginPass" placeholder="Contraseña de Seguridad" autocomplete="current-password">
            <button id="loginBtn">Ingresar al Sistema</button>
            <button id="closeModalBtn" style="margin-top:4px;">Cancelar</button>
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
            mostrarNotificacion("Complete ambos campos de acceso obligatorios.", "warning");
        }
    };
    document.getElementById('loginBtn').addEventListener('click', doLogin);
    document.getElementById('closeModalBtn').addEventListener('click', () => {
        if (currentUser) modal.remove();
    });
    document.getElementById('loginPass').addEventListener('keypress', (e) => { if (e.key === 'Enter') doLogin(); });
}

// -------------------- INICIO Y PERSISTENCIA DE LA APP --------------------
async function startApp() {
    inyectarEstilosProfesionales();
    
    const success = await cargarDatosDesdeCSV();
    if (!success) return;
    await inicializarVotosEnFirestore();
    await crearAdminInicial();
    escucharVotos();
    
    const floatingBtn = document.getElementById('floatingLoginBtn');
    if (floatingBtn) floatingBtn.style.display = 'none';

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            const inicioSesion = localStorage.getItem('inicio_sesion_timestamp');
            const SIETE_DIAS_MS = 7 * 24 * 60 * 60 * 1000;

            if (inicioSesion && (Date.now() - parseInt(inicioSesion) > SIETE_DIAS_MS)) {
                mostrarNotificacion("Su sesión de seguridad de 7 días ha expirado. Ingrese de nuevo.", "warning");
                logout();
                return;
            }

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
            if (!document.querySelector('.login-modal')) {
                showLoginModal();
            }
        }
    });
}

startApp();
