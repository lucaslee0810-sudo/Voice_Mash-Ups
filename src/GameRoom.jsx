import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from './supabaseClient'
import { STORY_PACKS, GAME_MODES, IMPROV_CHARACTERS } from './gameData'

export default function GameRoom({ roomId, roomCode, playerId, isHost, onLeave }) {
  const [room, setRoom] = useState(null)
  const [players, setPlayers] = useState([])
  const [modeVotes, setModeVotes] = useState([])
  const [recordings, setRecordings] = useState([])
  const [votes, setVotes] = useState([])
  const [myModeVote, setMyModeVote] = useState(null)
  const [myRecording, setMyRecording] = useState(null)
  const [myVotes, setMyVotes] = useState({}) // { funniest: playerId, 'most-random': playerId }
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [hasRecorded, setHasRecorded] = useState(false)
  const [playbackIndex, setPlaybackIndex] = useState(-1)
  const [shuffledRecordings, setShuffledRecordings] = useState([])
  const [voteCategory, setVoteCategory] = useState(null) // null, 'funniest', 'most-random'
  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])
  const timerRef = useRef(null)
  const streamRef = useRef(null)

  const pack = room?.story_pack ? STORY_PACKS[room.story_pack] : null
  const me = players.find(p => p.id === playerId)
  const myIndex = players.findIndex(p => p.id === playerId)

  // ============ REAL-TIME SUBSCRIPTIONS ============

  useEffect(() => {
    // Initial fetch
    fetchRoom()
    fetchPlayers()
    fetchModeVotes()
    fetchRecordings()
    fetchVotes()

    // Subscribe to changes
    const roomSub = supabase.channel('room-' + roomId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, () => fetchRoom())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${roomId}` }, () => fetchPlayers())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mode_votes', filter: `room_id=eq.${roomId}` }, () => fetchModeVotes())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recordings', filter: `room_id=eq.${roomId}` }, () => fetchRecordings())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'votes', filter: `room_id=eq.${roomId}` }, () => fetchVotes())
      .subscribe()

    return () => { supabase.removeChannel(roomSub) }
  }, [roomId])

  const fetchRoom = async () => {
    const { data } = await supabase.from('rooms').select().eq('id', roomId).single()
    if (data) setRoom(data)
  }
  const fetchPlayers = async () => {
    const { data } = await supabase.from('players').select().eq('room_id', roomId).order('created_at')
    if (data) setPlayers(data)
  }
  const fetchModeVotes = async () => {
    const { data } = await supabase.from('mode_votes').select().eq('room_id', roomId)
    if (data) setModeVotes(data)
  }
  const fetchRecordings = async () => {
    const { data } = await supabase.from('recordings').select().eq('room_id', roomId).order('created_at')
    if (data) setRecordings(data)
  }
  const fetchVotes = async () => {
    const { data } = await supabase.from('votes').select().eq('room_id', roomId)
    if (data) setVotes(data)
  }

  // ============ ROOM STATUS UPDATES (HOST ONLY) ============

  const updateRoomStatus = async (status, extra = {}) => {
    await supabase.from('rooms').update({ status, ...extra }).eq('id', roomId)
  }

  // ============ LOBBY ============

  const startVoting = () => {
    if (isHost && players.length >= 3) {
      updateRoomStatus('voting')
    }
  }

  // ============ MODE VOTING ============

  const castModeVote = async (mode) => {
    if (myModeVote) return
    setMyModeVote(mode)
    await supabase.from('mode_votes').insert({ room_id: roomId, player_id: playerId, mode })
  }

  // Check if all players voted for mode
  useEffect(() => {
    if (room?.status === 'voting' && modeVotes.length >= players.length && players.length > 0 && isHost) {
      const tally = {}
      modeVotes.forEach(v => { tally[v.mode] = (tally[v.mode] || 0) + 1 })
      const winner = Object.entries(tally).sort((a, b) => b[1] - a[1])[0][0]
      updateRoomStatus('picking-story', { game_mode: winner })
    }
  }, [modeVotes, players, room?.status])

  // ============ STORY PICK (HOST) ============

  const pickStory = async (packKey) => {
    if (isHost) {
      updateRoomStatus('recording', { story_pack: packKey })
    }
  }

  // ============ RECORDING ============

  const getMyPrompt = () => {
    if (!pack) return null
    const mode = room?.game_mode
    const promptIndex = mode === 'same' ? 0 : myIndex
    return pack.prompts[promptIndex % pack.prompts.length]
  }

  const getMyImprovCharacter = () => {
    if (room?.game_mode !== 'improv') return null
    return IMPROV_CHARACTERS[myIndex % IMPROV_CHARACTERS.length]
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' })
      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        stream.getTracks().forEach(t => t.stop())
        await uploadRecording(blob)
      }

      mediaRecorder.start()
      setIsRecording(true)
      setRecordingTime(0)
      timerRef.current = setInterval(() => {
        setRecordingTime(t => {
          if (t >= 8) { stopRecording(); return 8 }
          return t + 0.1
        })
      }, 100)
    } catch (err) {
      alert('Microphone access is needed! Check your browser/device settings.')
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
    setIsRecording(false)
    if (timerRef.current) clearInterval(timerRef.current)
  }

  const uploadRecording = async (blob) => {
    const fileName = `${roomId}/${playerId}-${Date.now()}.webm`
    const { error: uploadErr } = await supabase.storage.from('audio-clips').upload(fileName, blob, { contentType: 'audio/webm' })
    if (uploadErr) { alert('Upload failed. Try again.'); return }

    const { data: urlData } = supabase.storage.from('audio-clips').getPublicUrl(fileName)
    const prompt = getMyPrompt()

    await supabase.from('recordings').insert({
      room_id: roomId,
      player_id: playerId,
      prompt_fill: prompt?.fill || '',
      prompt_text: prompt?.prompt || '',
      audio_url: urlData.publicUrl,
    })

    setHasRecorded(true)
    setMyRecording(urlData.publicUrl)
  }

  const redoRecording = async () => {
    // Delete existing recording
    const existing = recordings.find(r => r.player_id === playerId)
    if (existing) {
      await supabase.from('recordings').delete().eq('id', existing.id)
    }
    setHasRecorded(false)
    setMyRecording(null)
  }

  // Check if all players recorded — host advances to playback
  useEffect(() => {
    if (room?.status === 'recording' && recordings.length >= players.length && players.length > 0 && isHost) {
      // Small delay to let everyone see the "waiting" state
      setTimeout(() => updateRoomStatus('playback'), 2000)
    }
  }, [recordings, players, room?.status])

  // Shuffle recordings when entering playback
  useEffect(() => {
    if (room?.status === 'playback' && recordings.length > 0) {
      const shuffled = [...recordings].sort(() => Math.random() - 0.5)
      setShuffledRecordings(shuffled)
    }
  }, [room?.status, recordings])

  // ============ VOTING ============

  const castAwardVote = async (category, votedForId) => {
    if (myVotes[category]) return
    setMyVotes(v => ({ ...v, [category]: votedForId }))
    await supabase.from('votes').insert({
      room_id: roomId,
      voter_id: playerId,
      voted_for_id: votedForId,
      category,
    })
  }

  const startAwardVoting = () => {
    if (isHost) updateRoomStatus('voting-awards')
    setVoteCategory('funniest')
  }

  useEffect(() => {
    if (room?.status === 'voting-awards' && !voteCategory) {
      setVoteCategory('funniest')
    }
  }, [room?.status])

  // Move to most-random after funniest
  useEffect(() => {
    if (voteCategory === 'funniest' && myVotes.funniest) {
      setVoteCategory('most-random')
    }
  }, [myVotes.funniest])

  // Show awards after both votes
  useEffect(() => {
    if (myVotes.funniest && myVotes['most-random']) {
      setVoteCategory('done')
    }
  }, [myVotes])

  // Check if all players finished voting
  const allVotesDone = votes.length >= players.length * 2

  const getAwardWinners = () => {
    const funnyTally = {}
    const randomTally = {}
    votes.forEach(v => {
      if (v.category === 'funniest') funnyTally[v.voted_for_id] = (funnyTally[v.voted_for_id] || 0) + 1
      if (v.category === 'most-random') randomTally[v.voted_for_id] = (randomTally[v.voted_for_id] || 0) + 1
    })
    const funnyWinner = Object.entries(funnyTally).sort((a, b) => b[1] - a[1])[0]
    const randomWinner = Object.entries(randomTally).sort((a, b) => b[1] - a[1])[0]
    return { funnyWinner, randomWinner }
  }

  // ============ CLEANUP ============

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [])

  // ============ RENDER ============

  if (!room) {
    return (
      <div style={{ minHeight: '100vh', background: 'radial-gradient(ellipse at 50% 0%, #1a1a2e 0%, #0a0a12 60%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#555', fontSize: 14 }}>Loading room...</div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(ellipse at 50% 0%, #1a1a2e 0%, #0a0a12 60%)' }}>
      {/* HEADER */}
      <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #ffffff08' }}>
        <button onClick={onLeave} style={{ background: 'none', border: 'none', color: '#555', fontSize: 13, cursor: 'pointer' }}>← Leave</button>
        <div style={{ background: '#ffffff08', borderRadius: 20, padding: '3px 12px', fontSize: 13, color: 'var(--accent)', fontFamily: 'var(--font-display)', letterSpacing: 2 }}>
          ROOM {roomCode}
        </div>
        <div style={{ fontSize: 11, color: '#555' }}>{players.length} 👥</div>
      </div>

      <div style={{ padding: '16px', maxWidth: 440, margin: '0 auto' }}>

        {/* ============ LOBBY ============ */}
        {room.status === 'lobby' && (
          <>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--accent)' }}>WAITING FOR PLAYERS</h2>
              <p style={{ color: '#666', fontSize: 12, margin: '4px 0 0' }}>Share code <b style={{ color: 'var(--accent)' }}>{roomCode}</b> with friends</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {players.map(p => (
                <div key={p.id} style={{
                  background: '#ffffff06', border: `1px solid ${p.id === playerId ? 'var(--accent)33' : '#ffffff10'}`,
                  borderRadius: 14, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12
                }}>
                  <div style={{ fontSize: 32 }}>{p.avatar}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: '#fff' }}>
                      {p.name} {p.is_host && <span style={{ fontSize: 10, color: '#FFD700' }}>👑 HOST</span>}
                      {p.id === playerId && <span style={{ fontSize: 10, color: 'var(--accent)' }}> (you)</span>}
                    </div>
                    {p.bio && <div style={{ color: '#888', fontSize: 11, fontStyle: 'italic' }}>{p.bio}</div>}
                    <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                      {[p.fave_sport, p.fave_food, p.fave_game].filter(Boolean).map((v, i) => (
                        <span key={i} style={{ background: '#ffffff08', borderRadius: 10, padding: '1px 7px', fontSize: 9, color: '#aaa' }}>{v}</span>
                      ))}
                      <span style={{ background: 'var(--accent)15', borderRadius: 10, padding: '1px 7px', fontSize: 9, color: 'var(--accent)' }}>🎙️ {p.voice_style}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {isHost ? (
              <button onClick={startVoting} disabled={players.length < 3} style={{
                width: '100%', padding: 14, borderRadius: 12,
                background: players.length >= 3 ? 'var(--accent)' : '#333',
                border: 'none', color: players.length >= 3 ? '#000' : '#666',
                fontFamily: 'var(--font-display)', fontSize: 18, cursor: players.length >= 3 ? 'pointer' : 'default'
              }}>
                {players.length < 3 ? `NEED ${3 - players.length} MORE PLAYERS` : 'START GAME →'}
              </button>
            ) : (
              <div style={{ textAlign: 'center', color: '#888', fontSize: 13, padding: 14 }}>
                Waiting for host to start the game...
              </div>
            )}
          </>
        )}

        {/* ============ MODE VOTING ============ */}
        {room.status === 'voting' && (
          <>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--accent)' }}>VOTE: GAME MODE</h2>
              <p style={{ color: '#666', fontSize: 12, margin: '4px 0 0' }}>
                {myModeVote ? `Waiting for others... (${modeVotes.length}/${players.length} voted)` : 'Pick how you want to play!'}
              </p>
            </div>

            {!myModeVote ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {GAME_MODES.map(mode => (
                  <button key={mode.id} onClick={() => castModeVote(mode.id)} style={{
                    background: '#ffffff06', border: `1px solid ${mode.color}33`,
                    borderRadius: 14, padding: '14px 16px', cursor: 'pointer', textAlign: 'left',
                    display: 'flex', alignItems: 'center', gap: 12
                  }}>
                    <span style={{ fontSize: 28 }}>{mode.icon}</span>
                    <div>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: mode.color }}>{mode.name}</div>
                      <div style={{ color: '#888', fontSize: 11, marginTop: 2 }}>{mode.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: 30 }}>
                <div style={{ fontSize: 40, animation: 'pulse 1.5s ease infinite' }}>🎲</div>
                <p style={{ color: '#aaa', fontSize: 13, marginTop: 10 }}>You voted for <b style={{ color: 'var(--accent)' }}>{GAME_MODES.find(m => m.id === myModeVote)?.name}</b></p>
              </div>
            )}
          </>
        )}

        {/* ============ PICK STORY (HOST) ============ */}
        {room.status === 'picking-story' && (
          <>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <div style={{ background: '#ffffff08', borderRadius: 20, padding: '4px 12px', display: 'inline-block', fontSize: 12, color: '#aaa', marginBottom: 8 }}>
                Mode: <b style={{ color: 'var(--accent)' }}>{GAME_MODES.find(m => m.id === room.game_mode)?.name}</b>
              </div>
              <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--accent)' }}>
                {isHost ? 'PICK A STORY' : 'HOST IS PICKING...'}
              </h2>
            </div>

            {isHost ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {Object.entries(STORY_PACKS).map(([key, p]) => (
                  <button key={key} onClick={() => pickStory(key)} style={{
                    background: '#ffffff06', border: `1px solid ${p.color}33`,
                    borderRadius: 14, padding: 16, cursor: 'pointer', textAlign: 'left',
                    display: 'flex', alignItems: 'center', gap: 14
                  }}>
                    <span style={{ fontSize: 36 }}>{p.icon}</span>
                    <div>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: p.color }}>{p.name}</div>
                      <div style={{ color: '#888', fontSize: 11, marginTop: 2 }}>{p.prompts.length} prompts</div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: 30 }}>
                <div style={{ fontSize: 40, animation: 'pulse 1.5s ease infinite' }}>🤔</div>
              </div>
            )}
          </>
        )}

        {/* ============ RECORDING ============ */}
        {room.status === 'recording' && pack && (
          <>
            <div style={{ textAlign: 'center', marginBottom: 12 }}>
              <div style={{ background: '#ffffff08', borderRadius: 20, padding: '4px 12px', display: 'inline-block', fontSize: 12, color: '#aaa', marginBottom: 8 }}>
                {pack.icon} {pack.name} • {GAME_MODES.find(m => m.id === room.game_mode)?.name}
              </div>
              <p style={{ color: '#666', fontSize: 11 }}>{recordings.length}/{players.length} recorded</p>
            </div>

            {!hasRecorded && !recordings.find(r => r.player_id === playerId) ? (
              <>
                {/* The prompt */}
                <div style={{
                  background: `${pack.color}10`, border: `2px solid ${pack.color}44`,
                  borderRadius: 16, padding: 20, marginBottom: 16, textAlign: 'center'
                }}>
                  <div style={{ color: pack.color, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 8 }}>
                    {me?.name}, YOUR PROMPT:
                  </div>
                  <div style={{ color: '#fff', fontSize: 18, fontFamily: 'var(--font-display)', lineHeight: 1.4 }}>
                    {getMyPrompt()?.prompt}
                  </div>
                  <div style={{ marginTop: 10, color: '#888', fontSize: 12, fontStyle: 'italic', background: '#ffffff06', borderRadius: 8, padding: '6px 10px', display: 'inline-block' }}>
                    fills in: "___<span style={{ color: pack.color }}> {getMyPrompt()?.fill} </span>___"
                  </div>
                  {getMyImprovCharacter() && (
                    <div style={{ marginTop: 8, color: '#a855f7', fontSize: 13, fontWeight: 600 }}>
                      🎭 Say it as: {getMyImprovCharacter()}
                    </div>
                  )}
                </div>

                {/* Record button */}
                <div style={{ textAlign: 'center' }}>
                  {!isRecording ? (
                    <button onClick={startRecording} style={{
                      width: 100, height: 100, borderRadius: '50%',
                      background: 'linear-gradient(135deg, #ff3333, #cc0000)',
                      border: '4px solid #ff333344', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      margin: '0 auto', boxShadow: '0 0 30px #ff333333'
                    }}>
                      <span style={{ color: '#fff', fontFamily: 'var(--font-display)', fontSize: 14 }}>TAP TO<br />RECORD</span>
                    </button>
                  ) : (
                    <div>
                      <button onClick={stopRecording} style={{
                        width: 100, height: 100, borderRadius: '50%',
                        background: 'linear-gradient(135deg, #ff3333, #cc0000)',
                        border: '4px solid #ff3333', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        margin: '0 auto', animation: 'recordPulse 1s ease infinite'
                      }}>
                        <span style={{ color: '#fff', fontFamily: 'var(--font-display)', fontSize: 26 }}>■</span>
                      </button>
                      <div style={{ marginTop: 10 }}>
                        <div style={{ width: '80%', height: 6, background: '#ffffff10', borderRadius: 3, margin: '0 auto', overflow: 'hidden' }}>
                          <div style={{ width: `${(recordingTime / 8) * 100}%`, height: '100%', background: '#ff3333', borderRadius: 3, transition: 'width 0.1s' }} />
                        </div>
                        <span style={{ color: '#ff3333', fontSize: 12, marginTop: 4, display: 'inline-block' }}>{recordingTime.toFixed(1)}s / 8s</span>
                      </div>
                    </div>
                  )}
                  <p style={{ color: '#666', fontSize: 11, marginTop: 10 }}>Tap to start, tap again to stop (max 8 sec)</p>
                </div>
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: 20 }}>
                <div style={{ fontSize: 48, marginBottom: 8 }}>✅</div>
                <p style={{ color: '#10b981', fontFamily: 'var(--font-display)', fontSize: 18 }}>RECORDED!</p>
                {myRecording && <audio controls src={myRecording} style={{ marginTop: 8, width: '100%', maxWidth: 280 }} />}
                <button onClick={redoRecording} style={{
                  marginTop: 12, padding: '8px 20px', borderRadius: 10, background: '#ffffff08',
                  border: '1px solid #ffffff20', color: '#aaa', fontSize: 13, cursor: 'pointer'
                }}>🔄 Redo</button>
                <p style={{ color: '#888', fontSize: 12, marginTop: 16 }}>
                  Waiting for others... ({recordings.length}/{players.length})
                </p>
                <div style={{ display: 'flex', gap: 4, justifyContent: 'center', marginTop: 8, flexWrap: 'wrap' }}>
                  {players.map(p => {
                    const hasRec = recordings.some(r => r.player_id === p.id)
                    return (
                      <span key={p.id} style={{
                        fontSize: 22, opacity: hasRec ? 1 : 0.3,
                        filter: hasRec ? 'none' : 'grayscale(1)'
                      }}>{p.avatar}</span>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {/* ============ PLAYBACK ============ */}
        {room.status === 'playback' && pack && (
          <>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 22, color: pack.color }}>
                {pack.icon} THE STORY {pack.icon}
              </h2>
            </div>

            {playbackIndex === -1 ? (
              <div style={{ textAlign: 'center', padding: 20 }}>
                <p style={{ color: '#888', fontSize: 13, marginBottom: 16 }}>All clips recorded! The order has been shuffled...</p>
                <button onClick={() => setPlaybackIndex(0)} style={{
                  padding: '14px 40px', borderRadius: 12, background: pack.color, border: 'none',
                  color: '#fff', fontFamily: 'var(--font-display)', fontSize: 18, cursor: 'pointer',
                  boxShadow: `0 0 30px ${pack.color}33`
                }}>▶ PLAY STORY</button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {shuffledRecordings.slice(0, playbackIndex + 1).map((rec, i) => {
                  const player = players.find(p => p.id === rec.player_id)
                  return (
                    <div key={rec.id} style={{
                      background: '#ffffff06', border: '1px solid #ffffff10',
                      borderRadius: 12, padding: 12, animation: 'fadeSlideIn 0.4s ease'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        <span style={{ fontSize: 24 }}>{player?.avatar}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>{player?.name}</div>
                          <div style={{ color: '#888', fontSize: 11, fontStyle: 'italic' }}>"{rec.prompt_fill}"</div>
                        </div>
                      </div>
                      <audio controls src={rec.audio_url} style={{ width: '100%', height: 36 }}
                        autoPlay={i === playbackIndex}
                        onEnded={() => {
                          if (playbackIndex < shuffledRecordings.length - 1) {
                            setTimeout(() => setPlaybackIndex(pi => pi + 1), 800)
                          }
                        }}
                      />
                    </div>
                  )
                })}

                {playbackIndex >= shuffledRecordings.length - 1 && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <button onClick={() => {
                      setShuffledRecordings([...recordings].sort(() => Math.random() - 0.5))
                      setPlaybackIndex(-1)
                    }} style={{
                      flex: 1, padding: 12, borderRadius: 12, background: '#ffffff08',
                      border: '1px solid #ffffff20', color: '#aaa', fontSize: 13, cursor: 'pointer',
                      fontFamily: 'var(--font-display)'
                    }}>🔀 RESHUFFLE</button>
                    <button onClick={startAwardVoting} style={{
                      flex: 1, padding: 12, borderRadius: 12, background: 'var(--accent)', border: 'none',
                      color: '#000', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-display)'
                    }}>🏆 VOTE →</button>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ============ AWARD VOTING ============ */}
        {room.status === 'voting-awards' && (
          <>
            {voteCategory && voteCategory !== 'done' ? (
              <>
                <div style={{ textAlign: 'center', marginBottom: 16 }}>
                  <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 20, color: 'var(--accent)' }}>
                    VOTE: {voteCategory === 'funniest' ? '🏆 Funniest Clip' : '🎲 Most Random'}
                  </h2>
                  <p style={{ color: '#666', fontSize: 11, margin: '4px 0 0' }}>
                    Who had the {voteCategory === 'funniest' ? 'funniest' : 'most random'} clip?
                  </p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {players.filter(p => p.id !== playerId).map(p => (
                    <button key={p.id} onClick={() => castAwardVote(voteCategory, p.id)} style={{
                      background: '#ffffff06', border: '1px solid #ffffff15', borderRadius: 12,
                      padding: '12px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left'
                    }}>
                      <span style={{ fontSize: 24 }}>{p.avatar}</span>
                      <span style={{ color: '#fff', fontSize: 14 }}>{p.name}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                {!allVotesDone ? (
                  <div style={{ textAlign: 'center', padding: 30 }}>
                    <div style={{ fontSize: 40, animation: 'pulse 1.5s ease infinite' }}>🏆</div>
                    <p style={{ color: '#aaa', fontSize: 13, marginTop: 10 }}>Waiting for everyone to vote... ({votes.length}/{players.length * 2})</p>
                  </div>
                ) : (
                  <>
                    <div style={{ textAlign: 'center', marginBottom: 20 }}>
                      <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 24, color: '#FFD700' }}>🏆 AWARDS 🏆</h2>
                    </div>
                    {(() => {
                      const { funnyWinner, randomWinner } = getAwardWinners()
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 24 }}>
                          {funnyWinner && (() => {
                            const p = players.find(pl => pl.id === funnyWinner[0])
                            return (
                              <div style={{ background: '#FFD70010', border: '1px solid #FFD70033', borderRadius: 16, padding: 16, textAlign: 'center' }}>
                                <div style={{ fontSize: 40 }}>{p?.avatar}</div>
                                <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: '#FFD700', marginTop: 4 }}>Funniest Clip</div>
                                <div style={{ color: '#fff', fontSize: 14 }}>{p?.name}</div>
                                <div style={{ color: '#888', fontSize: 11 }}>{funnyWinner[1]} vote{funnyWinner[1] !== 1 ? 's' : ''}</div>
                              </div>
                            )
                          })()}
                          {randomWinner && (() => {
                            const p = players.find(pl => pl.id === randomWinner[0])
                            return (
                              <div style={{ background: '#a855f710', border: '1px solid #a855f733', borderRadius: 16, padding: 16, textAlign: 'center' }}>
                                <div style={{ fontSize: 40 }}>{p?.avatar}</div>
                                <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: '#a855f7', marginTop: 4 }}>Most Random</div>
                                <div style={{ color: '#fff', fontSize: 14 }}>{p?.name}</div>
                                <div style={{ color: '#888', fontSize: 11 }}>{randomWinner[1]} vote{randomWinner[1] !== 1 ? 's' : ''}</div>
                              </div>
                            )
                          })()}
                        </div>
                      )
                    })()}

                    {isHost && (
                      <button onClick={async () => {
                        // Reset for new round
                        await supabase.from('recordings').delete().eq('room_id', roomId)
                        await supabase.from('votes').delete().eq('room_id', roomId)
                        await supabase.from('mode_votes').delete().eq('room_id', roomId)
                        setMyModeVote(null); setMyRecording(null); setHasRecorded(false)
                        setMyVotes({}); setVoteCategory(null); setPlaybackIndex(-1)
                        setShuffledRecordings([])
                        updateRoomStatus('voting', { story_pack: null, game_mode: null })
                      }} style={{
                        width: '100%', padding: 14, borderRadius: 12, background: 'var(--accent)', border: 'none',
                        color: '#000', fontFamily: 'var(--font-display)', fontSize: 18, cursor: 'pointer'
                      }}>🔄 PLAY AGAIN</button>
                    )}
                  </>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
