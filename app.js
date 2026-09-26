// ============ 工具 ============
const $ = (s) => document.querySelector(s);

const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
});
const now = () => Date.now();

function formatDate(ts) {
    const d = new Date(ts);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function todayStr() { return formatDate(now()).slice(0, 10); }
function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ============ IndexedDB ============
let db;
function openDB() {
    return new Promise((res, rej) => {
        const r = indexedDB.open('noteforge', 2);
        r.onupgradeneeded = (e) => {
            const d = e.target.result;
            if (!d.objectStoreNames.contains('subjects')) d.createObjectStore('subjects', { keyPath: 'id' });
            if (!d.objectStoreNames.contains('notes')) d.createObjectStore('notes', { keyPath: 'id' });
            if (!d.objectStoreNames.contains('settings')) d.createObjectStore('settings', { keyPath: 'key' });
            if (!d.objectStoreNames.contains('assets')) d.createObjectStore('assets', { keyPath: 'id' });
        };
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
    });
}
function idbAll(store) {
    return new Promise((res, rej) => {
        const r = db.transaction(store, 'readonly').objectStore(store).getAll();
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
    });
}
function idbPut(store, val) {
    return new Promise((res, rej) => {
        const r = db.transaction(store, 'readwrite').objectStore(store).put(val);
        r.onsuccess = () => res();
        r.onerror = () => rej(r.error);
    });
}
function idbDel(store, key) {
    return new Promise((res, rej) => {
        const r = db.transaction(store, 'readwrite').objectStore(store).delete(key);
        r.onsuccess = () => res();
        r.onerror = () => rej(r.error);
    });
}
function idbGet(store, key) {
    return new Promise((res, rej) => {
        const r = db.transaction(store, 'readonly').objectStore(store).get(key);
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
    });
}
async function getSetting(k, d) { const r = await idbGet('settings', k); return r ? r.value : d; }
async function setSetting(k, v) { await idbPut('settings', { key: k, value: v }); }

let saveTimer = null;

// ============ 状态 ============
const assetMap = new Map(); // assetId -> blob URL，用于渲染时同步查找
const state = {
    subjects: [],
    notes: [],
    currentSubjectId: null,
    currentNoteId: null,
    editMode: false,
    selectionMode: false,
    selectedNoteIds: new Set(),
    subjectSelectionMode: false,
    selectedSubjectIds: new Set(),
};

// ============ 初始化 ============
async function init() {
    db = await openDB();
    await loadAllAssets();
    state.subjects = (await idbAll('subjects')).sort((a, b) => a.order - b.order);
    state.notes = await idbAll('notes');

    await seedIfNeeded();

    applyFontSize(await getSetting('fontSize', 16));
    applyTheme(await getSetting('theme', 'auto'));

    const defId = await getSetting('defaultSubjectId', null);
    if (defId && state.subjects.find((s) => s.id === defId)) {
        state.currentSubjectId = defId;
    } else if (state.subjects.length > 0) {
        state.currentSubjectId = state.subjects[0].id;
    }

    renderSubjects();
    renderNotes();
    renderEditor();
    bindEvents();
    registerSW();
}

async function loadAllAssets() {
    const assets = await idbAll('assets');
    for (const a of assets) {
        if (!assetMap.has(a.id)) assetMap.set(a.id, URL.createObjectURL(a.blob));
    }
}

async function seedIfNeeded() {
    const initialized = await getSetting('initialized', false);
    if (initialized) return;

    const subjId = uuid();
    const ts = now();
    const subject = { id: subjId, name: '必读', order: 0 };
    const note = {
        id: uuid(),
        subjectId: subjId,
        title: '使用说明与 Markdown 速查',
        content: `# 欢迎使用 NoteForge

一个**完全离线**的 Markdown 笔记应用。数据保存在你的浏览器里，不需要网络也能写。

## 快速上手

- 左上角 ☰ 打开科目列表
- 科目栏右上角 ＋ 新建科目，🗑 删除当前科目
- 笔记列表右上角 ＋ 新建笔记，☑ 进入选择模式
- 右上角 ⋮ 打开设置（外观、字体、默认科目、模板、导入导出）

## 数据存在哪

笔记保存在浏览器 IndexedDB 里，关闭页面不丢，但**清理浏览器数据会丢失**。所以要定期导出备份。

⋮ → 导出数据，会下载一个 zip 文件，包含全部笔记、科目、图片。传到另一台设备，用 ⋮ → 导入数据 恢复。

## Markdown 速查

### 标题

\`# 一级\`、\`## 二级\`、\`### 三级\`

### 强调

\`**粗体**\`、\`*斜体*\`、\`~~删除线~~\`

### 列表

无序用 \`- \`，有序用 \`1. \`，任务列表用 \`- [ ]\` 和 \`- [x]\`。

### 链接与图片

链接：\`[文字](https://example.com)\`

图片：点编辑页右上角 🖼 按钮插入。图片会存进笔记里，导出时一起打包。

### 代码

行内用反引号，代码块用三个反引号包裹并标语言名：

\`\`\`python
print("hello")
\`\`\`

### 表格

用 \`|\` 分列，第二行用 \`---\` 定表头：

\`\`\`
| 字段 | 含义 |
| --- | --- |
| title | 标题 |
\`\`\`

### 引用

\`> 被引用的话\`

---

这篇笔记可以删，也可以留着当参考。`,
        createdAt: ts,
        updatedAt: ts,
    };

    await idbPut('subjects', subject);
    await idbPut('notes', note);
    state.subjects.push(subject);
    state.notes.push(note);
    await setSetting('initialized', true);
}

// ============ 渲染 ============
function renderSubjects() {
    const ul = $('#subjectList');
    ul.innerHTML = '';
    for (const s of state.subjects) {
        const li = document.createElement('li');
        li.className = 'subject-item' + (s.id === state.currentSubjectId ? ' active' : '');
        li.dataset.id = s.id;
        li.draggable = !state.subjectSelectionMode;
        if (state.subjectSelectionMode && state.selectedSubjectIds.has(s.id)) {
            li.classList.add('selected');
        }

        if (state.subjectSelectionMode) {
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.className = 'subject-check';
            cb.checked = state.selectedSubjectIds.has(s.id);
            li.appendChild(cb);
        }

        const span = document.createElement('span');
        span.className = 'subject-name';
        span.textContent = s.name;
        li.appendChild(span);
        ul.appendChild(li);
    }
    updateSubjectSelectionUI();
}

function renderNotes() {
    const ul = $('#noteList');
    const nameEl = $('#currentSubjectName');
    const emptyEl = $('#noteListEmpty');
    ul.innerHTML = '';

    const subj = state.subjects.find((s) => s.id === state.currentSubjectId);
    nameEl.textContent = subj ? subj.name : '未选择科目';

    if (!subj) {
        emptyEl.textContent = '还没有科目，点击左侧 + 新建';
        emptyEl.style.display = 'block';
        updateSelectionUI();
        return;
    }
    const notes = state.notes
        .filter((n) => n.subjectId === subj.id)
        .sort((a, b) => b.updatedAt - a.updatedAt);

    if (notes.length === 0) {
        emptyEl.textContent = '还没有笔记，点击右上角 + 新建一篇';
        emptyEl.style.display = 'block';
        updateSelectionUI();
        return;
    }
    emptyEl.style.display = 'none';

    for (const n of notes) {
        const li = document.createElement('li');
        li.className = 'note-item';
        li.dataset.id = n.id;
        if (state.selectionMode && state.selectedNoteIds.has(n.id)) {
            li.classList.add('selected');
        }

        if (state.selectionMode) {
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.className = 'note-check';
            cb.checked = state.selectedNoteIds.has(n.id);
            li.appendChild(cb);
        }

        const body = document.createElement('div');
        body.className = 'note-body';
        const t = document.createElement('div');
        t.className = 'note-item-title';
        t.textContent = n.title || '(无标题)';
        const m = document.createElement('div');
        m.className = 'note-item-meta';
        m.textContent = formatDate(n.updatedAt);
        body.append(t, m);
        li.appendChild(body);

        ul.appendChild(li);
    }

    updateSelectionUI();
}

function renderEditor() {
    if (state.currentNoteId) {
        const n = state.notes.find((x) => x.id === state.currentNoteId);
        if (n) {
            $('#noteTitle').value = n.title || '';
            $('#noteContent').value = n.content || '';
            updatePreview();
            $('#noteListView').classList.add('hidden');
            $('#editorView').classList.remove('hidden');
            $('#editToggleBtn').classList.remove('hidden');
            return;
        }
    }
    $('#noteListView').classList.remove('hidden');
    $('#editorView').classList.add('hidden');
    $('#editToggleBtn').classList.add('hidden');
}

// ============ Markdown 渲染（极简版） ============
function renderMarkdown(md) {
    // 先把内部的 nf:asset/<id> 引用换成 blob URL
    const pre = md.replace(/!\[([^\]]*)\]\(nf:asset\/([\w-]+)\)/g, (m, alt, id) => {
        const url = assetMap.get(id);
        return url ? `![${alt}](${url})` : `![图片丢失:${id}]()`;
    });
    return marked.parse(pre, {
        gfm: true,      // 表格、任务列表、删除线
        breaks: true,   // 单个换行当换行处理（便签场景更自然）
    });
}

function updatePreview() {
    $('#previewPane').innerHTML = renderMarkdown($('#noteContent').value);
}

// ============ 事件 ============
function bindEvents() {

    $('#insertImageBtn').addEventListener('click', insertImage);

    $('#menuBtn').addEventListener('click', () => {
        if (window.innerWidth <= 768) {
            $('#sidebar').classList.toggle('open');
            $('#overlay').classList.toggle('hidden');
        } else {
            $('#sidebar').classList.toggle('collapsed');
        }
    });
    $('#overlay').addEventListener('click', () => {
        $('#sidebar').classList.remove('open');
        $('#overlay').classList.add('hidden');
    });

    $('#editToggleBtn').addEventListener('click', () => {
        state.editMode = !state.editMode;
        $('#editToggleBtn').textContent = state.editMode ? '预览' : '编辑';
        const body = $('#editorBody');
        body.classList.toggle('mode-edit', state.editMode);
        body.classList.toggle('mode-preview', !state.editMode);
    });

    $('#moreBtn').addEventListener('click', (e) => {
        e.stopPropagation();
        $('#moreMenu').classList.toggle('hidden');
    });
    document.addEventListener('click', (e) => {
        if (!$('#moreMenu').contains(e.target) && e.target !== $('#moreBtn')) {
            $('#moreMenu').classList.add('hidden');
        }
    });
    $('#moreMenu').addEventListener('click', (e) => {
        const a = e.target.dataset.action;
        if (!a) return;
        $('#moreMenu').classList.add('hidden');
        handleAction(a);
    });

    $('#addSubjectBtn').addEventListener('click', addSubject);
    $('#addNoteBtn').addEventListener('click', addNote);

    $('#deleteSubjectBtn').addEventListener('click', deleteSubject);
    $('#filterNotesBtn').addEventListener('click', enterSelectionMode);
    $('#cancelSelectBtn').addEventListener('click', exitSelectionMode);
    $('#selectAllBtn').addEventListener('click', toggleSelectAll);
    $('#moveSelectedBtn').addEventListener('click', moveSelected);
    $('#deleteSelectedBtn').addEventListener('click', deleteSelected);

    $('#filterSubjectsBtn').addEventListener('click', enterSubjectSelectionMode);
    $('#cancelSubjectSelectBtn').addEventListener('click', exitSubjectSelectionMode);
    $('#selectAllSubjectsBtn').addEventListener('click', toggleSelectAllSubjects);
    $('#deleteSelectedSubjectsBtn').addEventListener('click', deleteSelectedSubjects);

    async function insertImage() {
        if (!state.currentNoteId) { alert('请先进入一篇笔记'); return; }
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.multiple = true;
        input.onchange = async () => {
            const ta = $('#noteContent');
            for (const file of input.files) {
                const id = uuid();
                const ext = (file.name.match(/\.([^.]+)$/) || [, 'png'])[1].toLowerCase();
                const asset = {
                    id,
                    name: file.name,
                    type: file.type,
                    ext,
                    blob: file,
                    createdAt: now(),
                };
                await idbPut('assets', asset);
                if (assetMap.has(id)) URL.revokeObjectURL(assetMap.get(id));
                assetMap.set(id, URL.createObjectURL(file));

                const md = `![${file.name}](nf:asset/${id})`;
                const start = ta.selectionStart;
                const end = ta.selectionEnd;
                ta.value = ta.value.slice(0, start) + md + ta.value.slice(end);
                ta.selectionStart = ta.selectionEnd = start + md.length;
            }
            ta.dispatchEvent(new Event('input'));
            ta.focus();
        };
        input.click();
    }

    $('#deleteNoteBtn').addEventListener('click', deleteNote);
    $('#backBtn').addEventListener('click', () => {
        state.currentNoteId = null;
        state.editMode = false;
        state.selectionMode = false;
        state.selectedNoteIds.clear();
        $('#editToggleBtn').textContent = '编辑';
        $('#editorBody').classList.remove('mode-edit');
        $('#editorBody').classList.add('mode-preview');
        renderNotes();
        renderEditor();
    });

    $('#subjectList').addEventListener('click', (e) => {
        const li = e.target.closest('.subject-item');
        if (!li) return;
        const subjId = li.dataset.id;

        if (state.subjectSelectionMode) {
            if (state.selectedSubjectIds.has(subjId)) {
                state.selectedSubjectIds.delete(subjId);
            } else {
                state.selectedSubjectIds.add(subjId);
            }
            renderSubjects();
            return;
        }

        state.currentSubjectId = subjId;
        state.currentNoteId = null;
        state.editMode = false;
        $('#editToggleBtn').textContent = '编辑';
        $('#editorBody').classList.remove('mode-edit');
        $('#editorBody').classList.add('mode-preview');
        renderSubjects();
        renderNotes();
        renderEditor();
        if (window.innerWidth <= 768) {
            $('#sidebar').classList.remove('open');
            $('#overlay').classList.add('hidden');
        }
    });

    $('#noteList').addEventListener('click', (e) => {
        const li = e.target.closest('.note-item');
        if (!li) return;
        const noteId = li.dataset.id;

        if (state.selectionMode) {
            if (state.selectedNoteIds.has(noteId)) {
                state.selectedNoteIds.delete(noteId);
            } else {
                state.selectedNoteIds.add(noteId);
            }
            renderNotes();
            return;
        }

        state.currentNoteId = noteId;
        state.editMode = false;
        $('#editToggleBtn').textContent = '编辑';
        $('#editorBody').classList.remove('mode-edit');
        $('#editorBody').classList.add('mode-preview');
        renderEditor();
    });

    const scheduleSave = () => {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(saveCurrentNote, 300);
    };
    window.addEventListener('beforeunload', () => {
        if (saveTimer) {
            clearTimeout(saveTimer);
            saveCurrentNote();
        }
    });
    $('#noteTitle').addEventListener('input', scheduleSave);
    $('#noteContent').addEventListener('input', () => {
        scheduleSave();
        updatePreview();
    });

    setupScrollSync();

    setupDragDrop();
}

// ============ 编辑/预览滚动同步（电脑端双向） ============
function setupScrollSync() {
    const ta = $('#noteContent');
    const pv = $('#previewPane');
    let syncing = false;

    function syncScroll(source, target) {
        if (syncing) return;
        if (window.innerWidth <= 768) return;
        const srcMax = source.scrollHeight - source.clientHeight;
        const tgtMax = target.scrollHeight - target.clientHeight;
        if (srcMax <= 0 || tgtMax <= 0) return;
        syncing = true;
        const ratio = source.scrollTop / srcMax;
        target.scrollTop = ratio * tgtMax;
        requestAnimationFrame(() => { syncing = false; });
    }

    ta.addEventListener('scroll', () => syncScroll(ta, pv));
    pv.addEventListener('scroll', () => syncScroll(pv, ta));
}

// ============ 拖拽排序（桌面） ============
function setupDragDrop() {
    const ul = $('#subjectList');
    ul.addEventListener('dragstart', (e) => {
        const li = e.target.closest('.subject-item');
        if (!li) return;
        li.classList.add('dragging');
    });
    ul.addEventListener('dragend', (e) => {
        const li = e.target.closest('.subject-item');
        if (li) li.classList.remove('dragging');
        persistSubjectOrder();
    });
    ul.addEventListener('dragover', (e) => {
        e.preventDefault();
        const dragging = ul.querySelector('.dragging');
        if (!dragging) return;
        const after = getDragAfter(ul, e.clientY);
        if (!after) ul.appendChild(dragging);
        else ul.insertBefore(dragging, after);
    });
}

function getDragAfter(ul, y) {
    const els = [...ul.querySelectorAll('.subject-item:not(.dragging)')];
    let closest = { offset: -Infinity, element: null };
    for (const el of els) {
        const box = el.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) closest = { offset, element: el };
    }
    return closest.element;
}

async function persistSubjectOrder() {
    const items = [...$('#subjectList').querySelectorAll('.subject-item')];
    state.subjects.sort((a, b) => items.findIndex((i) => i.dataset.id === a.id) - items.findIndex((i) => i.dataset.id === b.id));
    for (let i = 0; i < state.subjects.length; i++) {
        state.subjects[i].order = i;
        await idbPut('subjects', state.subjects[i]);
    }
    renderSubjects();
}

// ============ 操作 ============
async function addSubject() {
    const name = await promptModal('新建科目', '科目名称，如 Python');
    if (!name || !name.trim()) return;
    const s = { id: uuid(), name: name.trim(), order: state.subjects.length };
    await idbPut('subjects', s);
    state.subjects.push(s);
    state.currentSubjectId = s.id;
    state.currentNoteId = null;
    renderSubjects();
    renderNotes();
    renderEditor();
}

async function addNote() {
    if (!state.currentSubjectId) { alert('请先创建或选择一个科目'); return; }
    const title = await promptModal('新建笔记', '笔记标题');
    if (title === null) return;

    const defaultTpl = `## 一句话总结\n\n## 笔记\n\n## 复习记录\n- ${todayStr()}：创建。\n\n## 实践\n\n## 参考\n`;
    const tpl = await getSetting('noteTemplate', defaultTpl);
    const content = tpl
        .replace(/\{\{date\}\}/g, todayStr())
        .replace(/\{\{title\}\}/g, title.trim());

    const ts = now();
    const n = {
        id: uuid(),
        subjectId: state.currentSubjectId,
        title: title.trim(),
        content,
        createdAt: ts,
        updatedAt: ts,
    };
    await idbPut('notes', n);
    state.notes.push(n);
    state.currentNoteId = n.id;
    state.editMode = true;
    $('#editToggleBtn').textContent = '预览';
    $('#editorBody').classList.remove('mode-preview');
    $('#editorBody').classList.add('mode-edit');
    renderEditor();
    $('#noteTitle').focus();
}

async function saveCurrentNote() {
    if (!state.currentNoteId) return;
    const n = state.notes.find((x) => x.id === state.currentNoteId);
    if (!n) return;
    n.title = $('#noteTitle').value;
    n.content = $('#noteContent').value;
    n.updatedAt = now();
    await idbPut('notes', n);
}

function collectOrphanAssets(noteIds) {
    const referenced = new Set();
    for (const n of state.notes) {
        if (noteIds.includes(n.id)) continue;
        for (const m of (n.content || '').matchAll(/nf:asset\/([\w-]+)/g)) referenced.add(m[1]);
    }
    const orphans = [];
    for (const id of assetMap.keys()) {
        if (!referenced.has(id)) orphans.push(id);
    }
    return orphans;
}

async function removeAssets(ids) {
    for (const id of ids) {
        if (assetMap.has(id)) {
            URL.revokeObjectURL(assetMap.get(id));
            assetMap.delete(id);
        }
        await idbDel('assets', id);
    }
}

async function deleteNote() {
    if (!state.currentNoteId) return;
    const n = state.notes.find((x) => x.id === state.currentNoteId);
    if (!n) return;
    if (!confirm(`确定删除「${n.title || '无标题'}」？`)) return;

    const orphanIds = collectOrphanAssets([n.id]);
    await removeAssets(orphanIds);

    await idbDel('notes', n.id);
    state.notes = state.notes.filter((x) => x.id !== n.id);
    state.currentNoteId = null;
    state.editMode = false;
    $('#editToggleBtn').textContent = '编辑';
    $('#editorBody').classList.remove('mode-edit');
    $('#editorBody').classList.add('mode-preview');
    renderNotes();
    renderEditor();
}

// ============ 更多菜单 ============
function handleAction(a) {
    switch (a) {
        case 'theme': return showTheme();
        case 'fontSize': return showFontSize();
        case 'defaultSubject': return showDefaultSubject();
        case 'template': return showTemplate();
        case 'renameSubject': return renameSubject();
        case 'export': return exportData();
        case 'import': return importData();
        case 'factoryReset': return factoryReset();
    }
}

async function showTheme() {
    const cur = await getSetting('theme', 'auto');
    await modal({
        title: '外观',
        bodyHTML: `<select id="themeSel">
      <option value="auto"${cur === 'auto' ? ' selected' : ''}>跟随系统</option>
      <option value="light"${cur === 'light' ? ' selected' : ''}>浅色</option>
      <option value="dark"${cur === 'dark' ? ' selected' : ''}>深色</option>
    </select>`,
        onOk: async () => {
            const v = $('#themeSel').value;
            await setSetting('theme', v);
            applyTheme(v);
        },
    });
}

function applyTheme(v) {
    let actual = v;
    if (v === 'auto') actual = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    document.documentElement.dataset.theme = actual;
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', async () => {
    applyTheme(await getSetting('theme', 'auto'));
});

async function showFontSize() {
    const cur = await getSetting('fontSize', 16);
    await modal({
        title: '字体大小',
        bodyHTML: `<div style="display:flex;align-items:center;gap:0.5rem;margin-top:0.5rem">
      <span style="font-size:0.8rem">A</span>
      <input type="range" id="fontRange" min="12" max="24" step="1" value="${cur}" style="flex:1">
      <span style="font-size:1.2rem">A</span>
      <span id="fontVal" style="width:3.5em;text-align:right;font-size:0.9rem">${cur}px</span>
    </div>`,
        onMount: () => {
            $('#fontRange').addEventListener('input', (e) => { $('#fontVal').textContent = e.target.value + 'px'; });
        },
        onOk: async () => {
            const v = parseInt($('#fontRange').value, 10);
            await setSetting('fontSize', v);
            applyFontSize(v);
        },
    });
}
function applyFontSize(px) {
    document.documentElement.style.setProperty('--font-size', px + 'px');
}

async function showDefaultSubject() {
    const cur = await getSetting('defaultSubjectId', '');
    const opts = state.subjects
        .map((s) => `<option value="${s.id}"${s.id === cur ? ' selected' : ''}>${escapeHtml(s.name)}</option>`)
        .join('');
    await modal({
        title: '默认科目',
        bodyHTML: `<label style="font-size:0.9rem">打开应用时默认进入的科目：</label>
      <select id="defSubjSel">
        <option value="">（无）</option>${opts}
      </select>`,
        onOk: async () => {
            const v = $('#defSubjSel').value;
            await setSetting('defaultSubjectId', v || null);
        },
    });
}

async function showTemplate() {
    const def = `## 一句话总结\n\n## 笔记\n\n## 复习记录\n- {{date}}：创建。\n\n## 实践\n\n## 参考\n`;
    const cur = await getSetting('noteTemplate', def);
    await modal({
        title: '笔记模板',
        bodyHTML: `<p style="color:var(--fg-soft);font-size:0.85rem;margin:0 0 0.5rem">
      新建笔记时的初始内容。支持变量：<code>{{date}}</code>、<code>{{title}}</code>
    </p>
    <textarea id="tplInput" spellcheck="false"></textarea>`,
        onMount: () => { $('#tplInput').value = cur; },
        onOk: async () => {
            await setSetting('noteTemplate', $('#tplInput').value);
        },
    });
}

async function renameSubject() {
    if (!state.currentSubjectId) { alert('请先选择一个科目'); return; }
    const s = state.subjects.find((x) => x.id === state.currentSubjectId);
    if (!s) return;
    const name = await promptModal('重命名科目', s.name);
    if (!name || !name.trim()) return;
    s.name = name.trim();
    await idbPut('subjects', s);
    renderSubjects();
    renderNotes();
}

// ============ 导入导出 ============
async function exportData() {
    if (state.subjects.length === 0 && state.notes.length === 0) {
        alert('没有可导出的内容');
        return;
    }

    const subjectBlocks = state.subjects.map((s) => {
        const notes = state.notes.filter((n) => n.subjectId === s.id);
        const noteItems = notes.length
            ? notes
                .map(
                    (n) => `
        <label class="export-note-item">
          <input type="checkbox" data-note-id="${n.id}" data-subject-id="${s.id}" checked>
          <span>${escapeHtml(n.title || '(无标题)')}</span>
        </label>`
                )
                .join('')
            : `<div class="export-note-item" style="color:var(--fg-soft);font-style:italic">（无笔记）</div>`;
        return `
      <div class="export-subject">
        <label class="export-subject-head">
          <input type="checkbox" data-subject-toggle="${s.id}" checked>
          <strong>${escapeHtml(s.name)}</strong>
          <span class="export-count">${notes.length}</span>
        </label>
        <div class="export-notes">${noteItems}</div>
      </div>`;
    }).join('');

    let selected = null;

    await modal({
        title: '导出数据',
        bodyHTML: `
      <p style="margin:0 0 0.6rem">选择要导出的笔记：</p>
      <div class="export-tree" id="exportTree">${subjectBlocks || '<div style="color:var(--fg-soft)">还没有科目</div>'}</div>
      <div class="export-quick">
        <button type="button" class="btn" id="exportSelectAll">全选</button>
        <button type="button" class="btn" id="exportSelectNone">全不选</button>
      </div>
    `,
        okText: '导出',
        onMount: () => {
            const tree = $('#exportTree');

            tree.addEventListener('change', (e) => {
                const t = e.target;
                if (t.dataset.subjectToggle) {
                    const sid = t.dataset.subjectToggle;
                    tree.querySelectorAll(`input[data-subject-id="${sid}"]`).forEach((cb) => {
                        cb.checked = t.checked;
                    });
                } else if (t.dataset.noteId) {
                    const sid = t.dataset.subjectId;
                    const subs = [...tree.querySelectorAll(`input[data-subject-id="${sid}"]`)];
                    const parent = tree.querySelector(`input[data-subject-toggle="${sid}"]`);
                    const anyChecked = subs.some((cb) => cb.checked);
                    const allChecked = subs.every((cb) => cb.checked);
                    parent.checked = allChecked;
                    parent.indeterminate = anyChecked && !allChecked;
                }
            });

            $('#exportSelectAll').addEventListener('click', () => {
                tree.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
                    cb.checked = true; cb.indeterminate = false;
                });
            });
            $('#exportSelectNone').addEventListener('click', () => {
                tree.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
                    cb.checked = false; cb.indeterminate = false;
                });
            });
        },
        onOk: () => {
            selected = new Set();
            document.querySelectorAll('#exportTree input[data-note-id]:checked').forEach((cb) => {
                selected.add(cb.dataset.noteId);
            });
        },
    });

    if (!selected) return;
    if (selected.size === 0) { alert('没有选择任何笔记'); return; }

    await doExport(selected);
}

async function doExport(selectedNoteIds) {
    const settingsArr = await idbAll('settings');
    const settings = {};
    for (const s of settingsArr) settings[s.key] = s.value;

    const safeName = (s) =>
        String(s || '').replace(/[\\/:*?"<>|]/g, '_').replace(/^\.+$/, '_').trim() || 'untitled';

    const enc = new TextEncoder();
    const zipFiles = {};

    // 过滤
    const notes = state.notes.filter((n) => selectedNoteIds.has(n.id));
    const subjectIds = new Set(notes.map((n) => n.subjectId));
    const subjects = state.subjects.filter((s) => subjectIds.has(s.id));

    // 找出被引用的图片
    const referenced = new Set();
    for (const n of notes) {
        for (const m of (n.content || '').matchAll(/nf:asset\/([\w-]+)/g)) referenced.add(m[1]);
    }
    const allAssets = await idbAll('assets');
    const assets = allAssets.filter((a) => referenced.has(a.id));

    // 每张图片属于哪个科目（取首次引用的科目）
    const assetSubject = new Map();
    for (const n of notes) {
        const subj = subjects.find((s) => s.id === n.subjectId);
        if (!subj) continue;
        const subjDir = safeName(subj.name);
        for (const m of (n.content || '').matchAll(/nf:asset\/([\w-]+)/g)) {
            if (!assetSubject.has(m[1])) assetSubject.set(m[1], subjDir);
        }
    }

    const meta = {
        app: 'noteforge',
        version: 3,
        exportedAt: now(),
        settings,
        subjects: subjects.map((s) => ({ id: s.id, name: s.name, order: s.order })),
        assets: [],
        notes: [],
    };

    // 打包图片：<科目>/img/<id>.<ext>
    for (const a of assets) {
        const subjDir = assetSubject.get(a.id) || '_orphan';
        const path = `${subjDir}/img/${a.id}.${a.ext}`;
        const bytes = new Uint8Array(await a.blob.arrayBuffer());
        zipFiles[path] = [bytes, { level: 0 }];
        meta.assets.push({ id: a.id, name: a.name, type: a.type, ext: a.ext, file: path });
    }

    // 打包笔记：<科目>/md/<标题>.md
    const usedPaths = new Set();
    for (const n of notes) {
        const subj = subjects.find((s) => s.id === n.subjectId);
        if (!subj) continue;
        const subjDir = safeName(subj.name);
        const baseName = safeName(n.title || 'untitled');
        let path = `${subjDir}/md/${baseName}.md`;
        let i = 2;
        while (usedPaths.has(path)) path = `${subjDir}/md/${baseName}-${i++}.md`;
        usedPaths.add(path);

        let content = n.content || '';
        content = content.replace(/nf:asset\/([\w-]+)/g, (m, id) => {
            const a = meta.assets.find((x) => x.id === id);
            return a ? `../img/${a.id}.${a.ext}` : m;
        });

        zipFiles[path] = [enc.encode(content), { level: 6 }];
        meta.notes.push({
            id: n.id,
            subjectId: n.subjectId,
            title: n.title,
            file: path,
            createdAt: n.createdAt,
            updatedAt: n.updatedAt,
        });
    }

    zipFiles['noteforge.json'] = [enc.encode(JSON.stringify(meta, null, 2)), { level: 6 }];
    zipFiles['README.txt'] = [enc.encode(readmeText(meta)), { level: 6 }];

    const zipped = fflate.zipSync(zipFiles);
    const blob = new Blob([zipped], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `noteforge-backup-${todayStr()}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

function readmeText(meta) {
    return `NoteForge 导出文件
====================

导出时间：${new Date(meta.exportedAt).toLocaleString()}

目录结构：
  noteforge.json              配置与元数据
  <科目>/md/<标题>.md          该科目下的笔记（纯 Markdown）
  <科目>/img/<id>.<ext>        该科目用到的图片
  README.txt                  本文件

笔记为纯 Markdown，可用任何编辑器打开。
图片以相对路径 ../img/ 引用，保持目录结构即可本地预览。

导入时请使用未解压的 zip 文件。
也可以手动按相同目录结构整理 zip（无需 noteforge.json），
导入时应用会扫描目录，自动生成对应科目和笔记。
`;
}

function importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.zip,application/zip';
    input.onchange = async () => {
        const file = input.files[0];
        if (!file) return;
        try {
            const buf = new Uint8Array(await file.arrayBuffer());
            const zipFiles = fflate.unzipSync(buf);
            const dec = new TextDecoder();

            if (zipFiles['noteforge.json']) {
                await importFromBackup(zipFiles, dec);
            } else {
                await importFromManual(zipFiles, dec);
            }
        } catch (err) {
            alert('导入失败：' + err.message);
        }
    };
    input.click();
}

async function importFromBackup(zipFiles, dec) {
    const meta = JSON.parse(dec.decode(zipFiles['noteforge.json']));
    if (meta.app !== 'noteforge' || !Array.isArray(meta.subjects) || !Array.isArray(meta.notes)) {
        throw new Error('noteforge.json 格式不正确');
    }

    const assetsMeta = Array.isArray(meta.assets) ? meta.assets : [];
    const assetPathMap = new Map();
    for (const a of assetsMeta) assetPathMap.set(a.id, a.file);

    for (const a of assetsMeta) {
        const bytes = zipFiles[a.file];
        if (!bytes) continue;
        const blob = new Blob([bytes], { type: a.type || 'application/octet-stream' });
        await idbPut('assets', {
            id: a.id, name: a.name, type: a.type, ext: a.ext, blob, createdAt: now(),
        });
        if (assetMap.has(a.id)) URL.revokeObjectURL(assetMap.get(a.id));
        assetMap.set(a.id, URL.createObjectURL(blob));
    }

    const notes = [];
    let missing = 0;
    for (const n of meta.notes) {
        const raw = zipFiles[n.file];
        if (!raw) { missing++; continue; }
        let content = dec.decode(raw);
        content = content.replace(/\.\.\/img\/([\w-]+)\.\w+/g, (m, id) =>
            assetPathMap.has(id) ? `nf:asset/${id}` : m
        );
        notes.push({ ...n, content });
    }
    if (missing > 0) {
        const go = confirm(`有 ${missing} 篇笔记在 zip 中找不到对应文件，继续导入其余笔记？`);
        if (!go) return;
    }

    await handleImport({
        subjects: meta.subjects,
        notes,
        settings: meta.settings || {},
    });
}

async function importFromManual(zipFiles, dec) {
    const paths = Object.keys(zipFiles);
    const subjectsMap = new Map();

    for (const path of paths) {
        const parts = path.split('/');
        if (parts.length < 3) continue;
        const subjName = parts[0];
        const subfolder = parts[1];
        if (!subjectsMap.has(subjName)) subjectsMap.set(subjName, { notes: [], images: [] });

        if (subfolder === 'md' && path.endsWith('.md')) {
            subjectsMap.get(subjName).notes.push({
                filePath: path,
                fileName: parts[parts.length - 1],
            });
        } else if (subfolder === 'img') {
            subjectsMap.get(subjName).images.push({
                filePath: path,
                fileName: parts[parts.length - 1],
            });
        }
    }

    if (subjectsMap.size === 0) {
        throw new Error('未找到有效目录结构（应为 <科目>/md/*.md 与 <科目>/img/*）');
    }

    const ts = now();
    const newSubjects = [];
    const newNotes = [];
    let orderIdx = state.subjects.length;

    for (const [subjName, data] of subjectsMap) {
        if (data.notes.length === 0) continue;

        const subjId = uuid();
        newSubjects.push({ id: subjId, name: subjName, order: orderIdx++ });

        const imgNameToId = new Map();
        for (const img of data.images) {
            const bytes = zipFiles[img.filePath];
            if (!bytes) continue;
            const id = uuid();
            const ext = (img.fileName.match(/\.([^.]+)$/) || [, 'png'])[1].toLowerCase();
            const mime = guessMime(ext);
            const blob = new Blob([bytes], { type: mime });
            await idbPut('assets', {
                id, name: img.fileName, type: mime, ext, blob, createdAt: ts,
            });
            assetMap.set(id, URL.createObjectURL(blob));
            imgNameToId.set(img.fileName, id);
        }

        for (const n of data.notes) {
            let content = dec.decode(zipFiles[n.filePath]);
            content = content.replace(/\.\.\/img\/([^)\s]+)/g, (m, filename) => {
                const id = imgNameToId.get(filename);
                return id ? `nf:asset/${id}` : m;
            });
            content = content.replace(/!\[([^\]]*)\]\(img\/([^)]+)\)/g, (m, alt, filename) => {
                const id = imgNameToId.get(filename);
                return id ? `![${alt}](nf:asset/${id})` : m;
            });

            newNotes.push({
                id: uuid(),
                subjectId: subjId,
                title: n.fileName.replace(/\.md$/, ''),
                content,
                createdAt: ts,
                updatedAt: ts,
            });
        }
    }

    if (newSubjects.length === 0) throw new Error('未找到有效的笔记');

    await handleImport({
        subjects: newSubjects,
        notes: newNotes,
        settings: {},
    });
}

function guessMime(ext) {
    const map = {
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        gif: 'image/gif',
        webp: 'image/webp',
        svg: 'image/svg+xml',
        bmp: 'image/bmp',
        ico: 'image/x-icon',
    };
    return map[ext] || 'application/octet-stream';
}

async function handleImport(data) {
    const localSubjIds = new Set(state.subjects.map((s) => s.id));
    const localNoteIds = new Set(state.notes.map((n) => n.id));
    const subjConflicts = data.subjects.filter((s) => localSubjIds.has(s.id));
    const noteConflicts = data.notes.filter((n) => localNoteIds.has(n.id));
    let strategy = 'newest';

    if (subjConflicts.length + noteConflicts.length > 0) {
        const picked = await conflictDialog(subjConflicts, noteConflicts);
        if (picked === null) return;
        strategy = picked;
    }

    // 科目
    const subjMap = new Map(state.subjects.map((s) => [s.id, s]));
    for (const s of data.subjects) {
        const local = subjMap.get(s.id);
        if (!local) {
            await idbPut('subjects', s);
            state.subjects.push(s);
        } else if (strategy === 'overwrite') {
            Object.assign(local, s);
            await idbPut('subjects', local);
        }
    }

    // 笔记
    const noteMap = new Map(state.notes.map((n) => [n.id, n]));
    for (const n of data.notes) {
        const local = noteMap.get(n.id);
        if (!local) {
            await idbPut('notes', n);
            state.notes.push(n);
        } else if (strategy === 'overwrite' || (strategy === 'newest' && n.updatedAt > local.updatedAt)) {
            Object.assign(local, n);
            await idbPut('notes', local);
        }
    }

    // 设置
    if (data.settings && strategy !== 'skip') {
        for (const [k, v] of Object.entries(data.settings)) {
            if (v !== null && v !== undefined) await setSetting(k, v);
        }
    }

    state.subjects.sort((a, b) => a.order - b.order);
    applyFontSize(await getSetting('fontSize', 16));
    applyTheme(await getSetting('theme', 'auto'));
    renderSubjects();
    renderNotes();
    renderEditor();
    alert('导入完成');
}

function conflictDialog(subjConflicts, noteConflicts) {
    return new Promise((resolve) => {
        const listHtml = `
      ${subjConflicts.length ? `<div>科目：<ul>${subjConflicts.map((s) => `<li>${escapeHtml(s.name)}</li>`).join('')}</ul></div>` : ''}
      ${noteConflicts.length ? `<div>笔记：<ul>${noteConflicts.map((n) => `<li>${escapeHtml(n.title || '(无标题)')}</li>`).join('')}</ul></div>` : ''}
    `;
        modal({
            title: '导入冲突',
            bodyHTML: `
        <p>发现 <strong>${subjConflicts.length}</strong> 个科目、<strong>${noteConflicts.length}</strong> 篇笔记与本地重复。</p>
        <p style="color:var(--fg-soft);font-size:0.85rem;margin-bottom:0.5rem">请选择处理方式：</p>
        <div style="display:flex;flex-direction:column;gap:0.5rem">
          <label><input type="radio" name="strategy" value="newest" checked> 保留最新版本（按更新时间）</label>
          <label><input type="radio" name="strategy" value="overwrite"> 全部用导入文件覆盖</label>
          <label><input type="radio" name="strategy" value="skip"> 跳过重复，只导入新数据</label>
        </div>
        <details style="margin-top:0.75rem;font-size:0.85rem">
          <summary style="cursor:pointer;color:var(--fg-soft)">查看冲突列表</summary>
          <div style="margin-top:0.5rem">${listHtml}</div>
        </details>
      `,
            okText: '开始导入',
            onOk: () => {
                const v = document.querySelector('input[name="strategy"]:checked').value;
                resolve(v);
            },
            onCancel: () => resolve(null),
        });
    });
}

// ============ 通用模态框 ============
function modal({ title, bodyHTML, onOk, onCancel, onMount, okText, cancelText }) {
    return new Promise((resolve) => {
        $('#modalTitle').textContent = title || '';
        $('#modalBody').innerHTML = bodyHTML || '';
        $('#modalOk').textContent = okText || '确定';
        $('#modalCancel').textContent = cancelText || '取消';
        $('#modalMask').classList.remove('hidden');
        if (onMount) onMount();

        const okHandler = async () => {
            if (onOk) await onOk();
            close();
            resolve(true);
        };
        const cancelHandler = () => {
            if (onCancel) onCancel();
            close();
            resolve(false);
        };
        const close = () => {
            $('#modalMask').classList.add('hidden');
            $('#modalOk').removeEventListener('click', okHandler);
            $('#modalCancel').removeEventListener('click', cancelHandler);
            $('#modalClose').removeEventListener('click', cancelHandler);
        };
        $('#modalOk').addEventListener('click', okHandler);
        $('#modalCancel').addEventListener('click', cancelHandler);
        $('#modalClose').addEventListener('click', cancelHandler);
    });
}

function promptModal(title, placeholder) {
    return new Promise((resolve) => {
        let value = '';
        modal({
            title,
            bodyHTML: `<input type="text" id="promptInput" placeholder="${escapeHtml(placeholder || '')}">`,
            onMount: () => {
                const inp = $('#promptInput');
                inp.focus();
                inp.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') $('#modalOk').click();
                });
            },
            onOk: () => { value = $('#promptInput').value; },
        }).then((ok) => resolve(ok ? value : null));
    });
}

// ============ Service Worker ============
function registerSW() {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('sw.js').catch(() => { });
        });
    }
}

// ============ 选择模式 ============
function enterSelectionMode() {
    if (!state.currentSubjectId) {
        alert('请先选择一个科目');
        return;
    }
    state.selectionMode = true;
    state.selectedNoteIds.clear();
    renderNotes();
}

function exitSelectionMode() {
    state.selectionMode = false;
    state.selectedNoteIds.clear();
    renderNotes();
}

function updateSelectionUI() {
    $('#noteListViewHead').classList.toggle('hidden', state.selectionMode);
    $('#selectionHead').classList.toggle('hidden', !state.selectionMode);
    $('#selectionActions').classList.toggle('hidden', !state.selectionMode);
    $('#selectedCount').textContent = `已选 ${state.selectedNoteIds.size} 项`;
}

function toggleSelectAll() {
    const subj = state.subjects.find((s) => s.id === state.currentSubjectId);
    if (!subj) return;
    const notes = state.notes.filter((n) => n.subjectId === subj.id);
    const allSelected = notes.length > 0 && notes.every((n) => state.selectedNoteIds.has(n.id));
    if (allSelected) {
        state.selectedNoteIds.clear();
    } else {
        for (const n of notes) state.selectedNoteIds.add(n.id);
    }
    renderNotes();
}

// ============ 移动 / 删除选中笔记 ============
async function moveSelected() {
    if (state.selectedNoteIds.size === 0) {
        alert('请先选择要移动的笔记');
        return;
    }
    const others = state.subjects.filter((s) => s.id !== state.currentSubjectId);
    if (others.length === 0) {
        alert('没有其他科目可以移动，请先新建一个科目');
        return;
    }

    const opts = others
        .map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`)
        .join('');

    let targetId = others[0].id;
    const ok = await modal({
        title: '移动笔记',
        bodyHTML: `
      <p style="margin-top:0">将选中的 <strong>${state.selectedNoteIds.size}</strong> 篇笔记移动到：</p>
      <select id="moveTargetSel">${opts}</select>
    `,
        onMount: () => {
            targetId = $('#moveTargetSel').value;
            $('#moveTargetSel').addEventListener('change', (e) => { targetId = e.target.value; });
        },
        okText: '移动',
    });
    if (!ok) return;

    const ids = [...state.selectedNoteIds];
    for (const id of ids) {
        const n = state.notes.find((x) => x.id === id);
        if (n) {
            n.subjectId = targetId;
            n.updatedAt = now();
            await idbPut('notes', n);
        }
    }
    exitSelectionMode();
}

async function deleteSelected() {
    if (state.selectedNoteIds.size === 0) {
        alert('请先选择要删除的笔记');
        return;
    }
    const count = state.selectedNoteIds.size;
    const ok = await confirmModal(
        '删除笔记',
        `确定删除选中的 ${count} 篇笔记？此操作不可撤销。`,
        '删除',
        '取消'
    );
    if (!ok) return;

    const ids = [...state.selectedNoteIds];

    const orphanIds = collectOrphanAssets(ids);
    await removeAssets(orphanIds);

    for (const id of ids) {
        await idbDel('notes', id);
    }
    state.notes = state.notes.filter((n) => !ids.includes(n.id));

    if (state.currentNoteId && ids.includes(state.currentNoteId)) {
        state.currentNoteId = null;
        state.editMode = false;
        $('#editToggleBtn').textContent = '编辑';
        $('#editorBody').classList.remove('mode-edit');
        $('#editorBody').classList.add('mode-preview');
    }

    exitSelectionMode();
    renderEditor();
}

// ============ 科目选择模式 ============
function enterSubjectSelectionMode() {
    state.subjectSelectionMode = true;
    state.selectedSubjectIds.clear();
    renderSubjects();
}

function exitSubjectSelectionMode() {
    state.subjectSelectionMode = false;
    state.selectedSubjectIds.clear();
    renderSubjects();
}

function updateSubjectSelectionUI() {
    $('#sidebarHead').classList.toggle('hidden', state.subjectSelectionMode);
    $('#subjectSelectionHead').classList.toggle('hidden', !state.subjectSelectionMode);
    $('#subjectSelectionActions').classList.toggle('hidden', !state.subjectSelectionMode);
    $('#selectedSubjectCount').textContent = `已选 ${state.selectedSubjectIds.size} 项`;
}

function toggleSelectAllSubjects() {
    const allSelected = state.subjects.length > 0 && state.subjects.every((s) => state.selectedSubjectIds.has(s.id));
    if (allSelected) {
        state.selectedSubjectIds.clear();
    } else {
        for (const s of state.subjects) state.selectedSubjectIds.add(s.id);
    }
    renderSubjects();
}

async function deleteSelectedSubjects() {
    if (state.selectedSubjectIds.size === 0) {
        alert('请先选择要删除的科目');
        return;
    }
    const count = state.selectedSubjectIds.size;
    const notesCount = state.notes.filter((n) => state.selectedSubjectIds.has(n.subjectId)).length;
    const msg = notesCount > 0
        ? `确定删除选中的 ${count} 个科目？\n\n这将同时删除其下的 ${notesCount} 篇笔记，此操作不可撤销。`
        : `确定删除选中的 ${count} 个空科目？此操作不可撤销。`;
    const ok = await confirmModal('删除科目', msg, '删除', '取消');
    if (!ok) return;

    const ids = [...state.selectedSubjectIds];
    const affectedNotes = state.notes.filter((n) => ids.includes(n.subjectId));
    const orphanIds = collectOrphanAssets(affectedNotes.map((n) => n.id));
    await removeAssets(orphanIds);

    for (const id of ids) {
        const notes = state.notes.filter((n) => n.subjectId === id);
        for (const n of notes) await idbDel('notes', n.id);
        await idbDel('subjects', id);
    }
    state.notes = state.notes.filter((n) => !ids.includes(n.subjectId));
    state.subjects = state.subjects.filter((s) => !ids.includes(s.id));
    state.subjects.forEach((s, i) => { s.order = i; });
    for (const s of state.subjects) await idbPut('subjects', s);

    if (ids.includes(state.currentSubjectId)) {
        state.currentSubjectId = state.subjects.length > 0 ? state.subjects[0].id : null;
        state.currentNoteId = null;
        state.editMode = false;
        $('#editToggleBtn').textContent = '编辑';
        $('#editorBody').classList.remove('mode-edit');
        $('#editorBody').classList.add('mode-preview');
    }

    const defId = await getSetting('defaultSubjectId', null);
    if (defId && ids.includes(defId)) await setSetting('defaultSubjectId', null);

    exitSubjectSelectionMode();
    renderNotes();
    renderEditor();
}

// ============ 删除科目 ============
async function deleteSubject() {
    if (!state.currentSubjectId) {
        alert('请先选择一个科目');
        return;
    }
    const subj = state.subjects.find((s) => s.id === state.currentSubjectId);
    if (!subj) return;

    const notes = state.notes.filter((n) => n.subjectId === subj.id);

    if (notes.length === 0) {
        const ok = await confirmModal(
            '删除科目',
            `确定删除空科目「${subj.name}」？`,
            '删除',
            '取消'
        );
        if (!ok) return;
        await doDeleteSubject(subj, []);
        return;
    }

    const ok = await confirmModal(
        '删除科目',
        `科目「${subj.name}」下还有 ${notes.length} 篇笔记。\n\n删除科目会同时删除这些笔记，此操作不可撤销。\n\n确定要级联删除吗？`,
        '删除科目和笔记',
        '取消'
    );
    if (!ok) return;
    await doDeleteSubject(subj, notes);
}

async function doDeleteSubject(subj, notesToDelete) {
    const orphanIds = collectOrphanAssets(notesToDelete.map((n) => n.id));
    await removeAssets(orphanIds);

    for (const n of notesToDelete) {
        await idbDel('notes', n.id);
    }
    await idbDel('subjects', subj.id);

    state.notes = state.notes.filter((n) => n.subjectId !== subj.id);
    state.subjects = state.subjects.filter((s) => s.id !== subj.id);
    state.subjects.forEach((s, i) => { s.order = i; });
    for (const s of state.subjects) await idbPut('subjects', s);

    if (state.subjects.length > 0) {
        state.currentSubjectId = state.subjects[0].id;
    } else {
        state.currentSubjectId = null;
    }
    state.currentNoteId = null;
    state.selectionMode = false;
    state.selectedNoteIds.clear();
    state.editMode = false;
    $('#editToggleBtn').textContent = '编辑';
    $('#editorBody').classList.remove('mode-edit');
    $('#editorBody').classList.add('mode-preview');

    const defId = await getSetting('defaultSubjectId', null);
    if (defId === subj.id) await setSetting('defaultSubjectId', null);

    renderSubjects();
    renderNotes();
    renderEditor();
}

// ============ 确认对话框 ============
function confirmModal(title, message, okText = '确定', cancelText = '取消') {
    return modal({
        title,
        bodyHTML: `<p style="white-space:pre-wrap;margin:0">${escapeHtml(message)}</p>`,
        okText,
        cancelText,
    });
}

// ============ 恢复出厂设置 ============
async function factoryReset() {
    const ok = await confirmModal(
        '恢复出厂设置',
        '将清除所有科目、笔记、图片和设置，恢复到初始状态。\n\n此操作不可撤销，建议先导出数据备份。',
        '恢复',
        '取消'
    );
    if (!ok) return;

    for (const a of assetMap.values()) URL.revokeObjectURL(a);
    assetMap.clear();

    db.close();
    await new Promise((res, rej) => {
        const r = indexedDB.deleteDatabase('noteforge');
        r.onsuccess = res;
        r.onerror = () => rej(r.error);
    });
    location.reload();
}

// ============ 启动 ============
init().catch((err) => {
    console.error(err);
    alert('初始化失败：' + err.message);
});