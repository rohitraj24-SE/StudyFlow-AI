// ===== FLOATING AI DOUBT CHATBOT =====
let doubtChatOpen = false;

const toggleDoubtChat = () => {
  doubtChatOpen = !doubtChatOpen;
  document.getElementById('doubtChatPanel').classList.toggle('show', doubtChatOpen);
  if (doubtChatOpen) {
    setTimeout(() => document.getElementById('doubtChatInput').focus(), 100);
  }
};

const appendDoubtMessage = (text, sender) => {
  const container = document.getElementById('doubtChatMessages');
  const msg = document.createElement('div');
  msg.className = `doubt-msg doubt-msg-${sender}`;
  // Basic markdown-ish bold support (**text**) without full markdown parsing
  msg.innerHTML = escHtml(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
  container.appendChild(msg);
  container.scrollTop = container.scrollHeight;
};

const sendDoubtMessage = async (e) => {
  e.preventDefault();
  const input = document.getElementById('doubtChatInput');
  const question = input.value.trim();
  if (!question) return;

  appendDoubtMessage(question, 'user');
  input.value = '';

  const typingIndicator = document.createElement('div');
  typingIndicator.className = 'doubt-msg doubt-msg-bot doubt-msg-typing';
  typingIndicator.textContent = 'Thinking…';
  document.getElementById('doubtChatMessages').appendChild(typingIndicator);
  typingIndicator.scrollIntoView({ block: 'end' });

  try {
    const result = await aiAPI.doubtClear(question);
    typingIndicator.remove();
    appendDoubtMessage(result.answer, 'bot');
  } catch (err) {
    typingIndicator.remove();
    appendDoubtMessage("Sorry, I couldn't reach the server just now. Please try again in a moment.", 'bot');
  }
};
