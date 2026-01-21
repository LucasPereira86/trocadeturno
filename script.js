// Estado da aplicação
let selectedShift = null;
let pendingMaintenance = [];
let completedMaintenance = [];

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
    loadFromLocalStorage();
    renderTables();
});

// Selecionar turno
function selectShift(shift) {
    selectedShift = shift;
    
    // Remove classe active de todos os botões
    document.querySelectorAll('.shift-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Adiciona classe active ao botão selecionado
    document.querySelector(`.shift-btn[data-shift="${shift}"]`).classList.add('active');
    
    saveToLocalStorage();
}

// Adicionar nova linha na tabela
function addRow(type) {
    const id = Date.now();
    const newItem = {
        id: id,
        frota: '',
        manutencao: '',
        observacao: ''
    };
    
    if (type === 'pending') {
        pendingMaintenance.push(newItem);
    } else {
        completedMaintenance.push(newItem);
    }
    
    renderTables();
    saveToLocalStorage();
}

// Remover linha
function removeRow(type, id) {
    if (type === 'pending') {
        pendingMaintenance = pendingMaintenance.filter(item => item.id !== id);
    } else {
        completedMaintenance = completedMaintenance.filter(item => item.id !== id);
    }
    
    renderTables();
    saveToLocalStorage();
}

// Atualizar item
function updateItem(type, id, field, value) {
    const list = type === 'pending' ? pendingMaintenance : completedMaintenance;
    const item = list.find(item => item.id === id);
    if (item) {
        item[field] = value;
        saveToLocalStorage();
    }
}

// Renderizar tabelas
function renderTables() {
    // Tabela de pendentes
    const pendingBody = document.getElementById('pendingBody');
    pendingBody.innerHTML = pendingMaintenance.map(item => `
        <tr>
            <td>
                <input type="text" 
                       value="${escapeHtml(item.frota)}" 
                       placeholder="Ex: 1234"
                       onchange="updateItem('pending', ${item.id}, 'frota', this.value)">
            </td>
            <td>
                <textarea rows="2" 
                          placeholder="Descreva a manutenção a ser realizada..."
                          onchange="updateItem('pending', ${item.id}, 'manutencao', this.value)">${escapeHtml(item.manutencao)}</textarea>
            </td>
            <td>
                <textarea rows="2" 
                          placeholder="Observações adicionais..."
                          onchange="updateItem('pending', ${item.id}, 'observacao', this.value)">${escapeHtml(item.observacao)}</textarea>
            </td>
            <td class="action-col">
                <button class="delete-btn" onclick="removeRow('pending', ${item.id})">🗑️</button>
            </td>
        </tr>
    `).join('');
    
    // Tabela de concluídos
    const completedBody = document.getElementById('completedBody');
    completedBody.innerHTML = completedMaintenance.map(item => `
        <tr>
            <td>
                <input type="text" 
                       value="${escapeHtml(item.frota)}" 
                       placeholder="Ex: 1234"
                       onchange="updateItem('completed', ${item.id}, 'frota', this.value)">
            </td>
            <td>
                <textarea rows="2" 
                          placeholder="Descreva a manutenção realizada..."
                          onchange="updateItem('completed', ${item.id}, 'manutencao', this.value)">${escapeHtml(item.manutencao)}</textarea>
            </td>
            <td>
                <textarea rows="2" 
                          placeholder="Observações adicionais..."
                          onchange="updateItem('completed', ${item.id}, 'observacao', this.value)">${escapeHtml(item.observacao)}</textarea>
            </td>
            <td class="action-col">
                <button class="delete-btn" onclick="removeRow('completed', ${item.id})">🗑️</button>
            </td>
        </tr>
    `).join('');
}

// Gerar relatório em imagem
async function generateReport() {
    if (!selectedShift) {
        showToast('⚠️ Por favor, selecione um turno primeiro!', 'warning');
        return;
    }
    
    if (pendingMaintenance.length === 0 && completedMaintenance.length === 0) {
        showToast('⚠️ Adicione pelo menos uma manutenção!', 'warning');
        return;
    }
    
    // Atualizar dados do relatório
    document.getElementById('reportShift').textContent = `Turno ${selectedShift}`;
    document.getElementById('reportDate').textContent = new Date().toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
    
    // Popular tabelas do relatório
    const reportPendingBody = document.getElementById('reportPendingBody');
    const reportCompletedBody = document.getElementById('reportCompletedBody');
    
    if (pendingMaintenance.length > 0) {
        reportPendingBody.innerHTML = pendingMaintenance.map(item => `
            <tr>
                <td><strong>${escapeHtml(item.frota) || '-'}</strong></td>
                <td>${escapeHtml(item.manutencao) || '-'}</td>
                <td>${escapeHtml(item.observacao) || '-'}</td>
            </tr>
        `).join('');
    } else {
        reportPendingBody.innerHTML = '<tr><td colspan="3" style="text-align: center; opacity: 0.5;">Nenhuma manutenção pendente</td></tr>';
    }
    
    if (completedMaintenance.length > 0) {
        reportCompletedBody.innerHTML = completedMaintenance.map(item => `
            <tr>
                <td><strong>${escapeHtml(item.frota) || '-'}</strong></td>
                <td>${escapeHtml(item.manutencao) || '-'}</td>
                <td>${escapeHtml(item.observacao) || '-'}</td>
            </tr>
        `).join('');
    } else {
        reportCompletedBody.innerHTML = '<tr><td colspan="3" style="text-align: center; opacity: 0.5;">Nenhuma manutenção realizada</td></tr>';
    }
    
    // Mostrar container temporariamente para captura
    const reportContainer = document.getElementById('reportContainer');
    const report = document.getElementById('report');
    
    reportContainer.style.position = 'fixed';
    reportContainer.style.left = '0';
    reportContainer.style.top = '0';
    reportContainer.style.zIndex = '-1';
    reportContainer.style.opacity = '1';
    
    try {
        // Gerar imagem
        const canvas = await html2canvas(report, {
            scale: 2,
            backgroundColor: '#1a1a2e',
            useCORS: true
        });
        
        // Converter para imagem e fazer download
        const link = document.createElement('a');
        const date = new Date().toISOString().slice(0, 10);
        link.download = `troca-turno-${selectedShift}-${date}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        
        showToast('✅ Relatório gerado com sucesso!', 'success');
    } catch (error) {
        console.error('Erro ao gerar relatório:', error);
        showToast('❌ Erro ao gerar relatório!', 'error');
    } finally {
        // Esconder container novamente
        reportContainer.style.position = 'absolute';
        reportContainer.style.left = '-9999px';
        reportContainer.style.top = '-9999px';
    }
}

// Imprimir PDF
function printPDF() {
    if (!selectedShift) {
        showToast('⚠️ Por favor, selecione um turno primeiro!', 'warning');
        return;
    }
    
    if (pendingMaintenance.length === 0 && completedMaintenance.length === 0) {
        showToast('⚠️ Adicione pelo menos uma manutenção!', 'warning');
        return;
    }
    
    // Atualizar dados do relatório
    document.getElementById('reportShift').textContent = `Turno ${selectedShift}`;
    document.getElementById('reportDate').textContent = new Date().toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
    
    // Popular tabelas do relatório
    const reportPendingBody = document.getElementById('reportPendingBody');
    const reportCompletedBody = document.getElementById('reportCompletedBody');
    
    if (pendingMaintenance.length > 0) {
        reportPendingBody.innerHTML = pendingMaintenance.map(item => `
            <tr>
                <td><strong>${escapeHtml(item.frota) || '-'}</strong></td>
                <td>${escapeHtml(item.manutencao) || '-'}</td>
                <td>${escapeHtml(item.observacao) || '-'}</td>
            </tr>
        `).join('');
    } else {
        reportPendingBody.innerHTML = '<tr><td colspan="3" style="text-align: center; opacity: 0.5;">Nenhuma manutenção pendente</td></tr>';
    }
    
    if (completedMaintenance.length > 0) {
        reportCompletedBody.innerHTML = completedMaintenance.map(item => `
            <tr>
                <td><strong>${escapeHtml(item.frota) || '-'}</strong></td>
                <td>${escapeHtml(item.manutencao) || '-'}</td>
                <td>${escapeHtml(item.observacao) || '-'}</td>
            </tr>
        `).join('');
    } else {
        reportCompletedBody.innerHTML = '<tr><td colspan="3" style="text-align: center; opacity: 0.5;">Nenhuma manutenção realizada</td></tr>';
    }
    
    // Abrir janela de impressão
    const reportContainer = document.getElementById('reportContainer');
    const report = document.getElementById('report');
    
    // Criar nova janela para impressão
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <title>Troca de Turno - Turno ${selectedShift}</title>
            <style>
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }
                body {
                    font-family: 'Inter', Arial, sans-serif;
                    background: #fff;
                    color: #333;
                    padding: 20px;
                }
                .report-header {
                    text-align: center;
                    margin-bottom: 30px;
                    padding-bottom: 20px;
                    border-bottom: 3px solid #667eea;
                }
                .report-logo {
                    font-size: 48px;
                    margin-bottom: 10px;
                }
                h1 {
                    color: #1a1a2e;
                    font-size: 28px;
                    margin-bottom: 15px;
                }
                .report-info {
                    display: flex;
                    justify-content: center;
                    gap: 40px;
                    font-size: 16px;
                }
                .info-item strong {
                    color: #667eea;
                }
                .report-section {
                    margin-bottom: 30px;
                }
                .report-section h2 {
                    font-size: 18px;
                    margin-bottom: 15px;
                    padding: 10px 15px;
                    border-radius: 8px;
                }
                .report-section.pending h2 {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                }
                .report-section.completed h2 {
                    background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
                    color: white;
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                }
                th, td {
                    padding: 12px 15px;
                    text-align: left;
                    border: 1px solid #ddd;
                }
                th {
                    background: #f5f5f5;
                    font-weight: 600;
                    color: #333;
                }
                tr:nth-child(even) {
                    background: #fafafa;
                }
                .report-footer {
                    margin-top: 30px;
                    text-align: center;
                    font-size: 12px;
                    color: #888;
                    padding-top: 20px;
                    border-top: 1px solid #ddd;
                }
                @media print {
                    body { 
                        padding: 0;
                        -webkit-print-color-adjust: exact;
                        print-color-adjust: exact;
                    }
                }
            </style>
        </head>
        <body>
            <div class="report-header">
                <div class="report-logo">🔧</div>
                <h1>TROCA DE TURNO</h1>
                <div class="report-info">
                    <div class="info-item">
                        <strong>Turno:</strong> ${selectedShift}
                    </div>
                    <div class="info-item">
                        <strong>Data:</strong> ${new Date().toLocaleDateString('pt-BR', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                        })}
                    </div>
                </div>
            </div>
            
            <div class="report-section pending">
                <h2>📋 MANUTENÇÕES A SEREM REALIZADAS</h2>
                <table>
                    <thead>
                        <tr>
                            <th>FROTA</th>
                            <th>MANUTENÇÃO A SER REALIZADA</th>
                            <th>OBSERVAÇÃO</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${pendingMaintenance.length > 0 
                            ? pendingMaintenance.map(item => `
                                <tr>
                                    <td><strong>${escapeHtml(item.frota) || '-'}</strong></td>
                                    <td>${escapeHtml(item.manutencao) || '-'}</td>
                                    <td>${escapeHtml(item.observacao) || '-'}</td>
                                </tr>
                            `).join('')
                            : '<tr><td colspan="3" style="text-align: center; opacity: 0.5;">Nenhuma manutenção pendente</td></tr>'
                        }
                    </tbody>
                </table>
            </div>
            
            <div class="report-section completed">
                <h2>✅ MANUTENÇÕES REALIZADAS NO TURNO</h2>
                <table>
                    <thead>
                        <tr>
                            <th>FROTA</th>
                            <th>MANUTENÇÕES REALIZADAS</th>
                            <th>OBSERVAÇÃO</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${completedMaintenance.length > 0 
                            ? completedMaintenance.map(item => `
                                <tr>
                                    <td><strong>${escapeHtml(item.frota) || '-'}</strong></td>
                                    <td>${escapeHtml(item.manutencao) || '-'}</td>
                                    <td>${escapeHtml(item.observacao) || '-'}</td>
                                </tr>
                            `).join('')
                            : '<tr><td colspan="3" style="text-align: center; opacity: 0.5;">Nenhuma manutenção realizada</td></tr>'
                        }
                    </tbody>
                </table>
            </div>
            
            <div class="report-footer">
                <p>Relatório gerado automaticamente pelo Sistema de Troca de Turno</p>
            </div>
        </body>
        </html>
    `);
    
    printWindow.document.close();
    
    // Aguardar carregamento e imprimir
    printWindow.onload = function() {
        printWindow.print();
    };
    
    showToast('📄 Abrindo janela de impressão...', 'info');
}

// Limpar tudo
function clearAll() {
    if (confirm('Tem certeza que deseja limpar todos os dados?')) {
        selectedShift = null;
        pendingMaintenance = [];
        completedMaintenance = [];
        
        document.querySelectorAll('.shift-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        
        renderTables();
        saveToLocalStorage();
        showToast('🗑️ Dados limpos com sucesso!', 'info');
    }
}

// Salvar no LocalStorage
function saveToLocalStorage() {
    const data = {
        selectedShift,
        pendingMaintenance,
        completedMaintenance
    };
    localStorage.setItem('trocaTurnoData', JSON.stringify(data));
}

// Carregar do LocalStorage
function loadFromLocalStorage() {
    const saved = localStorage.getItem('trocaTurnoData');
    if (saved) {
        try {
            const data = JSON.parse(saved);
            selectedShift = data.selectedShift;
            pendingMaintenance = data.pendingMaintenance || [];
            completedMaintenance = data.completedMaintenance || [];
            
            if (selectedShift) {
                document.querySelector(`.shift-btn[data-shift="${selectedShift}"]`)?.classList.add('active');
            }
        } catch (e) {
            console.error('Erro ao carregar dados:', e);
        }
    }
}

// Escapar HTML para prevenir XSS
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Mostrar toast de notificação
function showToast(message, type = 'success') {
    // Remove toast existente
    const existingToast = document.querySelector('.toast');
    if (existingToast) {
        existingToast.remove();
    }
    
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    
    // Ajustar cores baseado no tipo
    if (type === 'warning') {
        toast.style.background = 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)';
    } else if (type === 'error') {
        toast.style.background = 'linear-gradient(135deg, #ff416c 0%, #ff4b2b 100%)';
    } else if (type === 'info') {
        toast.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
    }
    
    document.body.appendChild(toast);
    
    // Animar entrada
    setTimeout(() => toast.classList.add('show'), 10);
    
    // Remover após 3 segundos
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}
