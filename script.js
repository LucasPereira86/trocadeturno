// Estado da aplicação
let selectedShift = null;
const maintenance = {
    pending: [],
    completed: []
};

const PLACEHOLDERS = {
    pending: 'Descreva a manutenção a ser realizada...',
    completed: 'Descreva a manutenção realizada...'
};

const EMPTY_MESSAGES = {
    pending: 'Nenhuma manutenção pendente',
    completed: 'Nenhuma manutenção realizada'
};

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
    loadFromLocalStorage();
    renderTables();

    ['pending', 'completed'].forEach(type => {
        const body = document.getElementById(`${type}Body`);

        // Salva a cada tecla, para não perder o que foi digitado se o app for fechado
        body.addEventListener('input', event => {
            const field = event.target.dataset.field;
            if (field) {
                updateItem(type, event.target.closest('tr').dataset.id, field, event.target.value);
            }
        });

        body.addEventListener('click', event => {
            const button = event.target.closest('.delete-btn');
            if (button) {
                removeRow(type, button.closest('tr').dataset.id);
            }
        });
    });

    // Garante que o relatório impresso esteja atualizado mesmo com Ctrl+P
    window.addEventListener('beforeprint', fillReport);
});

// Gerar identificador único
function newId() {
    if (window.crypto && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// Selecionar turno
function selectShift(shift) {
    selectedShift = shift;
    updateShiftButtons();
    saveToLocalStorage();
}

function updateShiftButtons() {
    document.querySelectorAll('.shift-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.shift === selectedShift);
    });
}

// Adicionar nova linha na tabela
function addRow(type) {
    maintenance[type].push({
        id: newId(),
        frota: '',
        manutencao: '',
        observacao: ''
    });

    renderTables();
    saveToLocalStorage();
}

// Remover linha
function removeRow(type, id) {
    maintenance[type] = maintenance[type].filter(item => item.id !== id);
    renderTables();
    saveToLocalStorage();
}

// Atualizar item
function updateItem(type, id, field, value) {
    const item = maintenance[type].find(item => item.id === id);
    if (item) {
        item[field] = value;
        saveToLocalStorage();
    }
}

// Renderizar tabelas
function renderTables() {
    ['pending', 'completed'].forEach(type => {
        document.getElementById(`${type}Body`).innerHTML = maintenance[type].map(item => `
            <tr data-id="${escapeHtml(item.id)}">
                <td>
                    <input type="text"
                           value="${escapeHtml(item.frota)}"
                           placeholder="Ex: 1234"
                           data-field="frota">
                </td>
                <td>
                    <textarea rows="2"
                              placeholder="${PLACEHOLDERS[type]}"
                              data-field="manutencao">${escapeHtml(item.manutencao)}</textarea>
                </td>
                <td>
                    <textarea rows="2"
                              placeholder="Observações adicionais..."
                              data-field="observacao">${escapeHtml(item.observacao)}</textarea>
                </td>
                <td class="action-col">
                    <button class="delete-btn" type="button" aria-label="Excluir linha" title="Excluir linha">&times;</button>
                </td>
            </tr>
        `).join('');
    });
}

// Linhas com algum conteúdo (linhas totalmente vazias não entram no relatório)
function filledItems(type) {
    return maintenance[type].filter(item =>
        [item.frota, item.manutencao, item.observacao].some(value => value && value.trim())
    );
}

// Verifica se é possível gerar o relatório
function canGenerateReport() {
    if (!selectedShift) {
        showToast('Por favor, selecione um turno primeiro!', 'warning');
        return false;
    }

    if (filledItems('pending').length === 0 && filledItems('completed').length === 0) {
        showToast('Adicione pelo menos uma manutenção!', 'warning');
        return false;
    }

    return true;
}

// Preencher o relatório com os dados atuais
function fillReport() {
    document.getElementById('reportShift').textContent = selectedShift ? `Turno ${selectedShift}` : '-';
    document.getElementById('reportDate').textContent = new Date().toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });

    const typeToBody = { pending: 'reportPendingBody', completed: 'reportCompletedBody' };
    Object.entries(typeToBody).forEach(([type, bodyId]) => {
        const items = filledItems(type);
        document.getElementById(bodyId).innerHTML = items.length > 0
            ? items.map(item => `
                <tr>
                    <td><strong>${escapeHtml(item.frota) || '-'}</strong></td>
                    <td>${escapeHtml(item.manutencao) || '-'}</td>
                    <td>${escapeHtml(item.observacao) || '-'}</td>
                </tr>
            `).join('')
            : `<tr><td colspan="3" class="report-empty">${EMPTY_MESSAGES[type]}</td></tr>`;
    });
}

// Gerar relatório em imagem
async function generateReport() {
    if (!canGenerateReport()) return;

    if (typeof html2canvas === 'undefined') {
        showToast('Não foi possível carregar o gerador de imagem. Verifique a internet.', 'error');
        return;
    }

    fillReport();

    // Mostrar container temporariamente para captura
    const reportContainer = document.getElementById('reportContainer');
    reportContainer.classList.add('capturing');

    try {
        const canvas = await html2canvas(document.getElementById('report'), {
            scale: 2,
            backgroundColor: '#ffffff',
            useCORS: true
        });

        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        // Data local (toISOString usa UTC e à noite daria o dia seguinte)
        const now = new Date();
        const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        link.download = `troca-turno-${selectedShift}-${date}.png`;
        link.href = url;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);

        showToast('Relatório gerado com sucesso!', 'success');
    } catch (error) {
        console.error('Erro ao gerar relatório:', error);
        showToast('Erro ao gerar relatório!', 'error');
    } finally {
        reportContainer.classList.remove('capturing');
    }
}

// Imprimir PDF (o CSS de impressão mostra apenas o relatório)
function printPDF() {
    if (!canGenerateReport()) return;

    fillReport();
    window.print();
}

// Limpar tudo
function clearAll() {
    if (confirm('Tem certeza que deseja limpar todos os dados?')) {
        selectedShift = null;
        maintenance.pending = [];
        maintenance.completed = [];

        updateShiftButtons();
        renderTables();
        saveToLocalStorage();
        showToast('Dados limpos com sucesso!', 'info');
    }
}

// Salvar no LocalStorage
function saveToLocalStorage() {
    const data = {
        selectedShift,
        pendingMaintenance: maintenance.pending,
        completedMaintenance: maintenance.completed
    };
    try {
        localStorage.setItem('trocaTurnoData', JSON.stringify(data));
    } catch (e) {
        console.error('Erro ao salvar dados:', e);
    }
}

// Carregar do LocalStorage
function loadFromLocalStorage() {
    try {
        const saved = localStorage.getItem('trocaTurnoData');
        if (!saved) return;

        const data = JSON.parse(saved);
        selectedShift = data.selectedShift || null;
        // Versões antigas usavam ids numéricos; aqui todos viram texto
        const normalize = list => (list || []).map(item => ({ ...item, id: String(item.id) }));
        maintenance.pending = normalize(data.pendingMaintenance);
        maintenance.completed = normalize(data.completedMaintenance);

        updateShiftButtons();
    } catch (e) {
        console.error('Erro ao carregar dados:', e);
    }
}

// Escapar HTML para prevenir XSS
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML.replace(/"/g, '&quot;');
}

// Mostrar toast de notificação
function showToast(message, type = 'success') {
    const existingToast = document.querySelector('.toast');
    if (existingToast) {
        existingToast.remove();
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.setAttribute('role', 'status');
    toast.textContent = message;
    document.body.appendChild(toast);

    // Animar entrada
    setTimeout(() => toast.classList.add('show'), 10);

    // Remover após 3 segundos
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}
