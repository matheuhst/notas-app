let editingId = null;

async function fetchNotes() {
  const res = await fetch('/api/notes');
  return res.json();
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleString();
}

function dateKey(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString();
}

function groupByDay(notes) {
  const groups = {};
  for (const n of notes) {
    const key = dateKey(n.created_at);
    if (!groups[key]) groups[key] = [];
    groups[key].push(n);
  }
  return groups;
}

function el(tag, cls, txt) { const e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined) e.textContent = txt; return e; }

async function loadNotes() {
  const notes = await fetchNotes();
  const list = document.getElementById('notesList');
  list.innerHTML = '';
  const groups = groupByDay(notes);
  for (const day of Object.keys(groups)) {
    const gdiv = el('div', 'group');
    gdiv.appendChild(el('h3', '', day));
    for (const note of groups[day]) {
      const ndiv = el('div', 'note');
      const header = el('div', 'note-header');
      const meta = el('div', 'meta', formatDate(note.created_at));
      if (note.updated_at) meta.textContent += ' • editado ' + new Date(note.updated_at).toLocaleString();
      const content = el('div', 'content');
      content.innerHTML = note.content;
      const actions = el('div', 'actions');
      const editBtn = el('button', '', 'Editar');
      const delBtn = el('button', '', 'Excluir');
      editBtn.onclick = () => { 
        document.getElementById('noteContent').innerHTML = note.content; 
        editingId = note.id; 
        document.getElementById('status').textContent = 'Editando nota'; 
        window.scrollTo({top:0,behavior:'smooth'}); 
      };
      delBtn.onclick = async () => {
        if (!confirm('Excluir esta nota?')) return;
        await fetch('/api/notes/' + note.id, { method: 'DELETE' });
        await loadNotes();
      };
      actions.appendChild(editBtn);
      actions.appendChild(delBtn);
      header.appendChild(meta);
      header.appendChild(content);
      ndiv.appendChild(header);
      ndiv.appendChild(actions);
      gdiv.appendChild(ndiv);
    }
    list.appendChild(gdiv);
  }
}



async function saveNote() {
  const editor = document.getElementById('noteContent');
  const content = editor.innerHTML.trim();
  const status = document.getElementById('status');
  if (!content || content === '') { status.textContent = 'Digite algo antes de salvar.'; return; }
  status.textContent = 'Salvando...';
  if (editingId) {
    const res = await fetch('/api/notes/' + editingId, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ content }) });
    if (!res.ok) { status.textContent = 'Erro ao atualizar.'; return; }
    editingId = null;
  } else {
    const res = await fetch('/api/notes', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ content }) });
    if (!res.ok) { status.textContent = 'Erro ao salvar.'; return; }
  }
  editor.innerHTML = '';
  status.textContent = 'Salvo com sucesso.';
  setTimeout(()=> status.textContent = '', 2000);
  await loadNotes();
}

function clearEditor(){ 
  document.getElementById('noteContent').innerHTML = ''; 
  editingId = null; 
  document.getElementById('status').textContent = ''; 
}

document.getElementById('saveBtn').addEventListener('click', saveNote);
document.getElementById('clearBtn').addEventListener('click', clearEditor);

// image insertion
document.getElementById('insertImageBtn').addEventListener('click', () => {
  document.getElementById('imageInput').click();
});
document.getElementById('imageInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const status = document.getElementById('status');
  status.textContent = 'Enviando imagem...';
  try {
    const url = await uploadImage(file);
    insertImageAtCursor(url);
    status.textContent = 'Imagem inserida.';
    setTimeout(()=> status.textContent = '', 2000);
  } catch (err) {
    status.textContent = 'Erro ao enviar imagem.';
  }
  e.target.value = '';
});

async function uploadImage(file) {
  const fd = new FormData();
  fd.append('image', file);
  const res = await fetch('/api/upload', { method: 'POST', body: fd });
  if (!res.ok) throw new Error('upload failed');
  const data = await res.json();
  return data.url;
}

function insertImageAtCursor(url) {
  const editor = document.getElementById('noteContent');
  editor.focus();
  
  const selection = window.getSelection();
  const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : document.createRange();
  
  // Insert line break before image
  const br1 = document.createElement('br');
  range.insertNode(br1);
  range.setStartAfter(br1);
  
  // Insert image
  const img = document.createElement('img');
  img.src = url;
  img.alt = '';
  range.insertNode(img);
  range.setStartAfter(img);
  
  // Insert line break after image
  const br2 = document.createElement('br');
  range.insertNode(br2);
  range.setStartAfter(br2);
  
  selection.removeAllRanges();
  selection.addRange(range);
}

window.addEventListener('load', () => { loadNotes(); });
