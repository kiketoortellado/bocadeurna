// Dentro de renderAdminStats, modificar la creación del chartList:
const ctxList = document.getElementById('listasChart')?.getContext('2d');
if (ctxList) {
    if (chartList) chartList.destroy();
    const listaIds = Object.keys(listasConcejales);
    chartList = new Chart(ctxList, {
        type: 'bar',  // barras verticales (por defecto)
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

// Modificar renderDetalleConcejales para usar tabla sin bordes y sin paréntesis
function renderDetalleConcejales(candidatosPorListaOriginal) {
    const container = document.getElementById("concejalesDetalle");
    if (!container) return;
    let html = `<div style="display:flex; flex-wrap:wrap; gap:1rem;">`;
    for (const [lid, candidatos] of Object.entries(candidatosPorListaOriginal)) {
        const listaInfo = listasConcejales[lid];
        html += `<div style="flex:1; min-width:240px; background:#fef9ef; border-radius:1rem; padding:1rem; border-left:6px solid ${listaInfo.color};">
            <h4>Lista ${lid} – ${listaInfo.nombre}</h4>
            <p><strong>Total votos lista:</strong> ${candidatos.reduce((sum,c)=>sum+c.votos,0).toLocaleString()}</p>
            <table class="detalle-sin-bordes">`;
        html += `<thead><tr><th>N°</th><th>Candidato</th><th>Votos</th></tr></thead><tbody>`;
        candidatos.forEach(c => {
            html += `<tr><td>${c.opcion}</td><td>${c.nombre}</td><td style="text-align:right;">${c.votos.toLocaleString()}</td></tr>`;
        });
        html += `</tbody></table></div>`;
    }
    html += `</div>`;
    container.innerHTML = html;
}
