import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { sendChat } from '../net/socket';

/**
 * Chat de texto do círculo de conversa: só aparece quando há alguém próximo,
 * e as mensagens só vão para quem estava no círculo no momento do envio.
 *
 * Foco: enquanto o input está focado o teclado do jogo fica desligado (senão
 * WASD moveria o avatar enquanto digita). Para nunca "prender" o jogador:
 * Enter envia E devolve o foco ao jogo, Esc sai do chat, e o unmount do
 * painel sempre limpa o chatFocused.
 */
export function ChatPanel() {
  const nearby = useStore((s) => s.nearbyPeerIds);
  const messages = useStore((s) => s.chatMessages);
  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  // se o painel desmontar com o input focado (círculo esvaziou), o onBlur
  // não dispara — sem isso o teclado do jogo ficaria desligado para sempre
  useEffect(() => () => useStore.setState({ chatFocused: false }), []);

  if (nearby.length === 0) return null;

  function releaseFocus() {
    inputRef.current?.blur();
    useStore.setState({ chatFocused: false });
  }

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    sendChat(text);
    setText('');
    releaseFocus(); // enviou → volta a andar com as setas na hora
  }

  return (
    <div className="chat-panel">
      <div className="chat-header">
        💬 Círculo de conversa ({nearby.length + 1})
      </div>
      <div className="chat-messages" ref={listRef}>
        {messages.length === 0 && (
          <p className="chat-empty">Mensagens daqui só chegam a quem está perto de você.</p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={m.self ? 'chat-msg self' : 'chat-msg'}>
            <span className="chat-author">{m.self ? 'Você' : m.fromName}</span>
            <span className="chat-text">{m.text}</span>
          </div>
        ))}
      </div>
      <form className="chat-input-row" onSubmit={handleSend}>
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => useStore.setState({ chatFocused: true })}
          onBlur={() => useStore.setState({ chatFocused: false })}
          onKeyDown={(e) => {
            if (e.key === 'Escape') releaseFocus();
          }}
          placeholder="Mensagem para quem está perto… (Esc sai)"
          maxLength={500}
        />
        <button type="submit" disabled={!text.trim()}>➤</button>
      </form>
    </div>
  );
}
