import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import GameRoom from './GameRoom'

function generateRoomCode() {
  return Math.floor(1000 + Math.random() * 9000).toString()
}

export default function App() {
  const [screen, setScreen] = useState('home') // home, create-profile, join-profile, room
  const [roomId, setRoomId] = useState(null)
  const [roomCode, setRoomCode] = useState('')
  const [playerId, setPlayerId] = useState(null)
  const [isHost, setIsHost] = useState(false)
  const [joinCode, setJoinCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Profile state
  const [name, setName] = useState('')
  const [avatar, setAvatar] = useState('😎')
  const [bio, setBio] = useState('')
  const [voiceStyle, setVoiceStyle] = useState('normal')
  const [faves, setFaves] = useState({ sport: null, food: null, game: null })
  const [customFaves, setCustomFaves] = useState({ sport: '', food: '', game: '' })
  const [showCustom, setShowCustom] = useState({ sport: false, food: false, game: false })

  const AVATAR_OPTIONS = ["😎", "🤠", "👽", "🤖", "🦊", "🐸", "🦁", "🐻", "🎃", "👾", "🧙", "🦄", "🐲", "🦈", "🦅", "🐒"]
  const VOICE_STYLES = [
    { id: "normal", label: "Normal", icon: "🗣️" },
    { id: "robot", label: "Robot", icon: "🤖" },
    { id: "deep", label: "Deep", icon: "👹" },
    { id: "chipmunk", label: "Chipmunk", icon: "🐿️" },
    { id: "echo", label: "Echo", icon: "🌀" },
  ]
  const FAVE_CATEGORIES = [
    { key: "sport", label: "Sport", options: ["Basketball", "Football", "Soccer", "Baseball", "Swimming", "Skateboarding", "None"] },
    { key: "food", label: "Food", options: ["Pizza", "Tacos", "Sushi", "Burgers", "Chicken Nuggets", "Mac & Cheese", "Ramen"] },
    { key: "game", label: "Game", options: ["Minecraft", "Fortnite", "Roblox", "Mario", "Pokémon", "FIFA", "Zelda"] },
  ]

  const resetProfile = () => {
    setName(''); setAvatar('😎'); setBio(''); setVoiceStyle('normal')
    setFaves({ sport: null, food: null, game: null })
    setCustomFaves({ sport: '', food: '', game: '' })
    setShowCustom({ sport: false, food: false, game: false })
  }

  const createRoom = async () => {
    setLoading(true)
    setError('')
    const code = generateRoomCode()
    try {
      const { data, error: err } = await supabase
        .from('rooms')
        .insert({ code, status: 'lobby' })
        .select()
        .single()
      if (err) throw err
      setRoomId(data.id)
      setRoomCode(code)
      setIsHost(true)
      resetProfile()
      setScreen('create-profile')
    } catch (e) {
      setError('Failed to create room. Try again.')
    }
    setLoading(false)
  }

  const joinRoom = async () => {
    if (joinCode.length !== 4) { setError('Enter a 4-digit code'); return }
    setLoading(true)
    setError('')
    try {
      const { data, error: err } = await supabase
        .from('rooms')
        .select()
        .eq('code', joinCode)
        .single()
      if (err || !data) throw new Error('Room not found')
      if (data.status !== 'lobby') { setError('Game already in progress!'); setLoading(false); return }
      setRoomId(data.id)
      setRoomCode(joinCode)
      setIsHost(false)
      resetProfile()
      setScreen('join-profile')
    } catch (e) {
      setError('Room not found. Check the code.')
    }
    setLoading(false)
  }

  const submitProfile = async () => {
    if (!name.trim()) { setError('Enter a name!'); return }
    setLoading(true)
    setError('')
    try {
      const { data, error: err } = await supabase
        .from('players')
        .insert({
          room_id: roomId,
          name: name.trim(),
          avatar,
          bio: bio.trim() || null,
          voice_style: voiceStyle,
          fave_sport: faves.sport || null,
          fave_food: faves.food || null,
          fave_game: faves.game || null,
          is_host: isHost,
        })
        .select()
        .single()
      if (err) throw err
      setPlayerId(data.id)

      // If host, update room with host_id
      if (isHost) {
        await supabase.from('rooms').update({ host_id: data.id }).eq('id', roomId)
      }

      setScreen('room')
    } catch (e) {
      setError('Failed to join. Try again.')
    }
    setLoading(false)
  }

  const leaveGame = () => {
    setScreen('home')
    setRoomId(null)
    setRoomCode('')
    setPlayerId(null)
    setIsHost(false)
    setJoinCode('')
    setError('')
    resetProfile()
  }

  // ============ HOME SCREEN ============
  if (screen === 'home') {
    return (
      <div style={{ minHeight: '100vh', background: 'radial-gradient(ellipse at 50% 0%, #1a1a2e 0%, #0a0a12 60%)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ fontSize: 64, marginBottom: 8 }}>🎤</div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 36, letterSpacing: 2, background: 'linear-gradient(90deg, #00e5ff, #76ff03, #ffea00)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', margin: 0 }}>VOICE SWAP</h1>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 36, letterSpacing: 2, background: 'linear-gradient(90deg, #ffea00, #ff6b6b, #a855f7)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', margin: 0, marginTop: -4 }}>STORIES</h1>
          <p style={{ color: '#555', fontSize: 12, letterSpacing: 3, textTransform: 'uppercase', marginTop: 8 }}>Record. Shuffle. Chaos.</p>
        </div>

        <div style={{ width: '100%', maxWidth: 340, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button onClick={createRoom} disabled={loading} style={{
            padding: 16, borderRadius: 14, background: 'var(--accent)', border: 'none',
            color: '#000', fontFamily: 'var(--font-display)', fontSize: 22, cursor: 'pointer',
            letterSpacing: 2, opacity: loading ? 0.5 : 1
          }}>
            {loading ? '...' : '🎯 CREATE ROOM'}
          </button>

          <div style={{ textAlign: 'center', color: '#444', fontSize: 12, margin: '4px 0' }}>— or join a friend —</div>

          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={joinCode}
              onChange={e => { setJoinCode(e.target.value.replace(/\D/g, '').slice(0, 4)); setError('') }}
              placeholder="Room code"
              maxLength={4}
              inputMode="numeric"
              style={{
                flex: 1, background: '#ffffff08', border: '1px solid #ffffff15', borderRadius: 12,
                padding: '14px 16px', color: '#fff', fontSize: 20, fontFamily: 'var(--font-display)',
                textAlign: 'center', letterSpacing: 8, outline: 'none'
              }}
            />
            <button onClick={joinRoom} disabled={loading || joinCode.length !== 4} style={{
              padding: '14px 20px', borderRadius: 12, background: joinCode.length === 4 ? '#76ff03' : '#333',
              border: 'none', color: joinCode.length === 4 ? '#000' : '#666',
              fontFamily: 'var(--font-display)', fontSize: 16, cursor: joinCode.length === 4 ? 'pointer' : 'default'
            }}>JOIN</button>
          </div>

          {error && <p style={{ color: '#ff4444', fontSize: 13, textAlign: 'center' }}>{error}</p>}
        </div>
      </div>
    )
  }

  // ============ PROFILE SCREEN ============
  if (screen === 'create-profile' || screen === 'join-profile') {
    return (
      <div style={{ minHeight: '100vh', background: 'radial-gradient(ellipse at 50% 0%, #1a1a2e 0%, #0a0a12 60%)', padding: '20px 16px' }}>
        <div style={{ maxWidth: 420, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <div style={{ background: '#ffffff08', borderRadius: 20, padding: '4px 14px', display: 'inline-block', fontSize: 13, color: 'var(--accent)', fontFamily: 'var(--font-display)', letterSpacing: 2, marginBottom: 12 }}>
              ROOM {roomCode}
            </div>
            <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 24, color: 'var(--accent)' }}>Create Your Profile</h2>
          </div>

          <label style={{ color: '#aaa', fontSize: 12, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Display Name *</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder='e.g. TACO LORD' maxLength={20}
            style={{ width: '100%', background: '#ffffff08', border: '1px solid #ffffff15', borderRadius: 10, padding: '12px 14px', color: '#fff', fontSize: 16, fontFamily: 'var(--font-display)', outline: 'none', marginBottom: 16 }} />

          <label style={{ color: '#aaa', fontSize: 12, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Avatar</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 6, marginBottom: 16 }}>
            {AVATAR_OPTIONS.map(a => (
              <button key={a} onClick={() => setAvatar(a)} style={{
                background: avatar === a ? 'var(--accent)22' : '#ffffff08',
                border: `2px solid ${avatar === a ? 'var(--accent)' : 'transparent'}`,
                borderRadius: 10, padding: 6, fontSize: 22, cursor: 'pointer'
              }}>{a}</button>
            ))}
          </div>

          <label style={{ color: '#aaa', fontSize: 12, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Voice Style</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, marginBottom: 16 }}>
            {VOICE_STYLES.map(v => (
              <button key={v.id} onClick={() => setVoiceStyle(v.id)} style={{
                background: voiceStyle === v.id ? 'var(--accent)22' : '#ffffff08',
                border: `1px solid ${voiceStyle === v.id ? 'var(--accent)' : '#ffffff15'}`,
                borderRadius: 10, padding: '8px 2px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2
              }}>
                <span style={{ fontSize: 18 }}>{v.icon}</span>
                <span style={{ color: voiceStyle === v.id ? 'var(--accent)' : '#888', fontSize: 9 }}>{v.label}</span>
              </button>
            ))}
          </div>

          <label style={{ color: '#aaa', fontSize: 12, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Bio (optional)</label>
          <input value={bio} onChange={e => setBio(e.target.value)} placeholder='e.g. professional snack critic' maxLength={50}
            style={{ width: '100%', background: '#ffffff08', border: '1px solid #ffffff15', borderRadius: 10, padding: '10px 14px', color: '#fff', fontSize: 13, outline: 'none', marginBottom: 16 }} />

          <label style={{ color: '#aaa', fontSize: 12, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Faves</label>
          {FAVE_CATEGORIES.map(cat => (
            <div key={cat.key} style={{ marginBottom: 10 }}>
              <div style={{ color: '#666', fontSize: 11, marginBottom: 4 }}>{cat.label}</div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {cat.options.map(opt => (
                  <button key={opt} onClick={() => {
                    setFaves(f => ({ ...f, [cat.key]: opt }))
                    setShowCustom(s => ({ ...s, [cat.key]: false }))
                  }} style={{
                    background: faves[cat.key] === opt && !showCustom[cat.key] ? 'var(--accent)22' : '#ffffff08',
                    border: `1px solid ${faves[cat.key] === opt && !showCustom[cat.key] ? 'var(--accent)' : '#ffffff10'}`,
                    borderRadius: 20, padding: '4px 10px', cursor: 'pointer',
                    color: faves[cat.key] === opt && !showCustom[cat.key] ? 'var(--accent)' : '#888', fontSize: 11
                  }}>{opt}</button>
                ))}
                <button onClick={() => {
                  setShowCustom(s => ({ ...s, [cat.key]: true }))
                  setFaves(f => ({ ...f, [cat.key]: customFaves[cat.key] || '' }))
                }} style={{
                  background: showCustom[cat.key] ? 'var(--accent)22' : '#ffffff08',
                  border: `1px solid ${showCustom[cat.key] ? 'var(--accent)' : '#ffffff10'}`,
                  borderRadius: 20, padding: '4px 10px', cursor: 'pointer',
                  color: showCustom[cat.key] ? 'var(--accent)' : '#888', fontSize: 11
                }}>Other ✏️</button>
              </div>
              {showCustom[cat.key] && (
                <input value={customFaves[cat.key]}
                  onChange={e => { setCustomFaves(c => ({ ...c, [cat.key]: e.target.value })); setFaves(f => ({ ...f, [cat.key]: e.target.value })) }}
                  placeholder={`Type your ${cat.label.toLowerCase()}...`} maxLength={20}
                  style={{ marginTop: 6, width: '100%', background: '#ffffff08', border: '1px solid var(--accent)44', borderRadius: 10, padding: '8px 12px', color: '#fff', fontSize: 12, outline: 'none' }} />
              )}
            </div>
          ))}

          <button onClick={submitProfile} disabled={!name.trim() || loading} style={{
            width: '100%', marginTop: 16, padding: 14, borderRadius: 12,
            background: name.trim() ? 'var(--accent)' : '#333', border: 'none',
            color: name.trim() ? '#000' : '#666', fontFamily: 'var(--font-display)', fontSize: 18,
            cursor: name.trim() ? 'pointer' : 'default', letterSpacing: 1
          }}>
            {loading ? 'JOINING...' : "I'M IN →"}
          </button>

          {error && <p style={{ color: '#ff4444', fontSize: 13, textAlign: 'center', marginTop: 8 }}>{error}</p>}
        </div>
      </div>
    )
  }

  // ============ GAME ROOM ============
  if (screen === 'room') {
    return (
      <GameRoom
        roomId={roomId}
        roomCode={roomCode}
        playerId={playerId}
        isHost={isHost}
        onLeave={leaveGame}
      />
    )
  }

  return null
}
