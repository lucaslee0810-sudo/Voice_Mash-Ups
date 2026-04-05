import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabaseClient'
import { STORY_PACKS, GAME_MODES, IMPROV_CHARACTERS } from './gameData'

const ROUNDS_PER_GAME = 3

export default function GameRoom({ roomId, roomCode, playerId, isHost, onLeave }) {
  const [room, setRoom] = useState(null)
  const [players, setPlayers] = useState([])
  const [modeVotes, setModeVotes] = useState([])
  const [recordings, setRecordings] = useState([])
  const [votes, setVotes] = useState([])
  const [myModeVote, setMyModeVote] = useState(null)
  const [myRecording, setMyRecording] = useState(null)
  const [myVotes, setMyVotes] = useState({})
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [hasRecorded, setHasRecorded] = useState(false)
  const [currentRound, setCurrentRound] = useState(1)
  const [playbackIndex, setPlaybackIndex] = useState(-1)
  const [shuffledRecordings, setShuffledRecordings] = useState([])
  const [voteCategory, setVoteCategory] = useState(null)
  const [bridges, setBridges] = useState([])
  const [bridgesLoading, setBridgesLoading] = useState(false)
  const [playingBridge, setPlayingBridge] = useState(false)
  const [narratorStyle, setNarratorStyle] = useState('dramatic')
  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])
  const timerRef = useRef(null)
  const streamRef = useRef(null)

  const pack = room?.story_pack ? STORY_PACKS[room.story_pack] : null
  const me = players.find(p => p.id === playerId)
  const myIndex = players.findIndex(p => p.id === playerId)
  const isPlaybackDone = playbackIndex >= shuffledRecordings.length && shuffledRecordings.length > 0

  useEffect(() => {
    fetchRoom(); fetchPlayers(); fetchModeVotes(); fetchRecordings(); fetchVotes()
    const ch = supabase.channel('room-' + roomId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: 'id=eq.' + roomId }, () => fetchRoom())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: 'room_id=eq.' + roomId }, () => fetchPlayers())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mode_votes', filter: 'room_id=eq.' + roomId }, () => fetchModeVotes())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recordings', filter: 'room_id=eq.' + roomId }, () => fetchRecordings())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'votes', filter: 'room_id=eq.' + roomId }, () => fetchVotes())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [roomId])

  const fetchRoom = async () => { const {data}=await supabase.from('rooms').select().eq('id',roomId).single(); if(data) setRoom(data) }
  const fetchPlayers = async () => { const {data}=await supabase.from('players').select().eq('room_id',roomId).order('created_at'); if(data) setPlayers(data) }
  const fetchModeVotes = async () => { const {data}=await supabase.from('mode_votes').select().eq('room_id',roomId); if(data) setModeVotes(data) }
  const fetchRecordings = async () => { const {data}=await supabase.from('recordings').select().eq('room_id',roomId).order('created_at'); if(data) setRecordings(data) }
  const fetchVotes = async () => { const {data}=await supabase.from('votes').select().eq('room_id',roomId); if(data) setVotes(data) }
  const updateRoomStatus = async (status, extra={}) => { await supabase.from('rooms').update({status,...extra}).eq('id',roomId) }

  // Lobby
  const startVoting = () => { if(isHost && players.length>=3) updateRoomStatus('voting') }

  // Mode voting
  const castModeVote = async (mode) => { if(myModeVote) return; setMyModeVote(mode); await supabase.from('mode_votes').insert({room_id:roomId,player_id:playerId,mode}) }
  useEffect(() => {
    if(room?.status==='voting' && modeVotes.length>=players.length && players.length>0 && isHost) {
      const t={}; modeVotes.forEach(v=>{t[v.mode]=(t[v.mode]||0)+1}); const w=Object.entries(t).sort((a,b)=>b[1]-a[1])[0][0]
      updateRoomStatus('picking-story',{game_mode:w})
    }
  }, [modeVotes,players,room?.status])

  const pickStory = async (k) => { if(isHost) updateRoomStatus('recording',{story_pack:k}) }

  // Recording
  const getMyPrompt = () => {
    if(!pack) return null; const mode=room?.game_mode
    const off=(currentRound-1)*players.length; const idx=mode==='same'?(currentRound-1):(off+myIndex)
    return pack.prompts[idx%pack.prompts.length]
  }
  const getMyImprovChar = () => room?.game_mode!=='improv'?null:IMPROV_CHARACTERS[(myIndex+currentRound-1)%IMPROV_CHARACTERS.length]

  const startRec = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({audio:true}); streamRef.current=stream
      const opts={}; if(typeof MediaRecorder!=='undefined'&&MediaRecorder.isTypeSupported&&MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) opts.mimeType='audio/webm;codecs=opus'
      const mr=new MediaRecorder(stream,opts); mediaRecorderRef.current=mr; chunksRef.current=[]
      mr.ondataavailable=(e)=>{if(e.data.size>0) chunksRef.current.push(e.data)}
      mr.onstop=async()=>{const blob=new Blob(chunksRef.current,{type:mr.mimeType||'audio/webm'}); stream.getTracks().forEach(t=>t.stop()); await uploadRec(blob)}
      mr.start(); setIsRecording(true); setRecordingTime(0)
      timerRef.current=setInterval(()=>{setRecordingTime(t=>{if(t>=8){stopRec();return 8}return t+0.1})},100)
    } catch(e){alert('Microphone access needed!')}
  }
  const stopRec = () => { if(mediaRecorderRef.current?.state==='recording') mediaRecorderRef.current.stop(); setIsRecording(false); if(timerRef.current) clearInterval(timerRef.current) }

  const uploadRec = async (blob) => {
    const fn=roomId+'/'+playerId+'-r'+currentRound+'-'+Date.now()+'.webm'
    const {error:ue}=await supabase.storage.from('audio-clips').upload(fn,blob,{contentType:blob.type||'audio/webm'})
    if(ue){alert('Upload failed');return}
    const {data:ud}=supabase.storage.from('audio-clips').getPublicUrl(fn); const pr=getMyPrompt()
    await supabase.from('recordings').insert({room_id:roomId,player_id:playerId,prompt_fill:pr?.fill||'',prompt_text:pr?.prompt||'',audio_url:ud.publicUrl,round_number:currentRound})
    setHasRecorded(true); setMyRecording(ud.publicUrl)
  }

  const redoRec = async () => {
    const mine=recordings.filter(r=>r.player_id===playerId&&r.round_number===currentRound); const last=mine[mine.length-1]
    if(last) await supabase.from('recordings').delete().eq('id',last.id); setHasRecorded(false); setMyRecording(null)
  }

  const playersFinished = () => new Set(recordings.filter(r=>r.round_number===currentRound).map(r=>r.player_id)).size

  useEffect(() => {
    if(room?.status!=='recording'||players.length===0) return; const fin=playersFinished()
    if(fin>=players.length){
      if(currentRound<ROUNDS_PER_GAME) setTimeout(()=>{setCurrentRound(r=>r+1);setHasRecorded(false);setMyRecording(null)},1500)
      else if(isHost) setTimeout(()=>updateRoomStatus('playback'),2000)
    }
  }, [recordings,players,room?.status,currentRound])

  useEffect(() => {
    const mine=recordings.filter(r=>r.player_id===playerId&&r.round_number===currentRound)
    if(mine.length>0){setHasRecorded(true);setMyRecording(mine[mine.length-1].audio_url)} else {setHasRecorded(false);setMyRecording(null)}
  }, [currentRound,recordings])

  // AI Bridges
  const genBridges = async (shuffled) => {
    setBridgesLoading(true)
    try {
      const descs=shuffled.map((r,i)=>{const p=players.find(x=>x.id===r.player_id);return 'Clip '+(i+1)+': '+(p?.name||'?')+' - "'+r.prompt_fill+'"'}).join('\n')
      const sn=pack?.name||'?'
      const ns=narratorStyle==='sports'?'ESPN sports commentator':narratorStyle==='horror'?'creepy horror narrator':narratorStyle==='nature'?'nature documentary narrator':'movie trailer narrator'
      const res=await fetch('/api/generate-bridges',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({model:'claude-haiku-4-5-20251001',max_tokens:1000,messages:[{role:'user',content:
          'You narrate a party game called StorySmash. Theme: "'+sn+'". Voice clips were shuffled randomly. Write SHORT FUNNY narration bridges.\n\nClips:\n'+descs+'\n\nWrite '+(shuffled.length+1)+' bridges: 1 opening before clip 1, 1 between each consecutive pair, 1 closing after last clip. Each bridge 1-2 sentences MAX. Be FUNNY, dramatic, absurd. Reference player names. Style: over-the-top '+ns+'. Return ONLY a JSON array of strings, no markdown.'}]})})
      const d=await res.json(); const tx=(d.content&&d.content[0]&&d.content[0].text)||'[]'
      setBridges(JSON.parse(tx.replace(/```json/g,'').replace(/```/g,'').trim()))
    } catch(e) {
      console.error(e); const fb=['And so our story begins...']; for(let i=1;i<shuffled.length;i++) fb.push('But then, everything changed...'); fb.push('THE END... or is it?!'); setBridges(fb)
    }
    setBridgesLoading(false)
  }

  useEffect(() => {
    if(room?.status==='playback'&&recordings.length>0&&bridges.length===0&&!bridgesLoading) {
      const s=[...recordings].sort(()=>Math.random()-0.5); setShuffledRecordings(s); genBridges(s)
    }
  }, [room?.status,recordings])

  const speakBridge = (text,onDone) => {
    if(!('speechSynthesis' in window)){onDone();return}; setPlayingBridge(true); window.speechSynthesis.cancel()
    const u=new SpeechSynthesisUtterance(text)
    u.rate=narratorStyle==='sports'?1.3:narratorStyle==='horror'?0.7:0.9
    u.pitch=narratorStyle==='sports'?1.2:narratorStyle==='horror'?0.5:0.8
    u.onend=()=>{setPlayingBridge(false);onDone()}; u.onerror=()=>{setPlayingBridge(false);onDone()}
    window.speechSynthesis.speak(u)
  }

  const startPlayback = () => {
    if(bridges.length>0){setPlaybackIndex(-0.5);speakBridge(bridges[0],()=>setPlaybackIndex(0))} else setPlaybackIndex(0)
  }

  const advancePlayback = () => {
    const next=Math.floor(playbackIndex)+1
    if(next<shuffledRecordings.length){
      if(bridges[next]){setPlaybackIndex(next-0.5);speakBridge(bridges[next],()=>setPlaybackIndex(next))} else setPlaybackIndex(next)
    } else {
      const closing=bridges[bridges.length-1]
      if(closing&&playbackIndex<shuffledRecordings.length){setPlaybackIndex(shuffledRecordings.length-0.5);speakBridge(closing,()=>setPlaybackIndex(shuffledRecordings.length))}
      else setPlaybackIndex(shuffledRecordings.length)
    }
  }

  const doReshuffle = () => { const s=[...recordings].sort(()=>Math.random()-0.5); setShuffledRecordings(s); setBridges([]); setPlaybackIndex(-1); genBridges(s) }

  // Voting
  const castAwardVote = async (cat,vid) => { if(myVotes[cat]) return; setMyVotes(v=>({...v,[cat]:vid})); await supabase.from('votes').insert({room_id:roomId,voter_id:playerId,voted_for_id:vid,category:cat}) }
  const startAwardVoting = () => { if(isHost) updateRoomStatus('voting-awards'); setVoteCategory('funniest') }
  useEffect(()=>{if(room?.status==='voting-awards'&&!voteCategory) setVoteCategory('funniest')},[room?.status])
  useEffect(()=>{if(voteCategory==='funniest'&&myVotes.funniest) setVoteCategory('most-random')},[myVotes.funniest])
  useEffect(()=>{if(myVotes.funniest&&myVotes['most-random']) setVoteCategory('done')},[myVotes])
  const allVotesDone = votes.length >= players.length * 2
  const getWinners = () => {
    const ft={},rt={}; votes.forEach(v=>{if(v.category==='funniest') ft[v.voted_for_id]=(ft[v.voted_for_id]||0)+1; if(v.category==='most-random') rt[v.voted_for_id]=(rt[v.voted_for_id]||0)+1})
    return {funnyWinner:Object.entries(ft).sort((a,b)=>b[1]-a[1])[0], randomWinner:Object.entries(rt).sort((a,b)=>b[1]-a[1])[0]}
  }

  useEffect(()=>{return ()=>{if(timerRef.current) clearInterval(timerRef.current)}},[])

  if(!room) return <div style={{minHeight:'100vh',background:'radial-gradient(ellipse at 50% 0%,#1a1a2e 0%,#0a0a12 60%)',display:'flex',alignItems:'center',justifyContent:'center'}}><div style={{color:'#555',fontSize:14}}>Loading room...</div></div>

  // RENDER HELPERS
  const hdr = (
    <div style={{padding:'12px 16px',display:'flex',justifyContent:'space-between',alignItems:'center',borderBottom:'1px solid #ffffff08'}}>
      <button onClick={onLeave} style={{background:'none',border:'none',color:'#555',fontSize:13,cursor:'pointer'}}>← Leave</button>
      <div style={{background:'#ffffff08',borderRadius:20,padding:'3px 12px',fontSize:13,color:'var(--accent)',fontFamily:'var(--font-display)',letterSpacing:2}}>ROOM {roomCode}</div>
      <div style={{fontSize:11,color:'#555'}}>{players.length} 👥</div>
    </div>
  )

  const playerCard = (p) => (
    <div key={p.id} style={{background:'#ffffff06',border:'1px solid '+(p.id===playerId?'var(--accent)33':'#ffffff10'),borderRadius:14,padding:'12px 14px',display:'flex',alignItems:'center',gap:12}}>
      <div style={{fontSize:32}}>{p.avatar}</div>
      <div style={{flex:1}}>
        <div style={{fontFamily:'var(--font-display)',fontSize:16,color:'#fff'}}>{p.name} {p.is_host&&<span style={{fontSize:10,color:'#FFD700'}}>👑</span>} {p.id===playerId&&<span style={{fontSize:10,color:'var(--accent)'}}>(you)</span>}</div>
        {p.bio&&<div style={{color:'#888',fontSize:11,fontStyle:'italic'}}>{p.bio}</div>}
        <div style={{display:'flex',gap:4,marginTop:4,flexWrap:'wrap'}}>
          {[p.fave_sport,p.fave_food,p.fave_game].filter(Boolean).map((v,i)=><span key={i} style={{background:'#ffffff08',borderRadius:10,padding:'1px 7px',fontSize:9,color:'#aaa'}}>{v}</span>)}
          <span style={{background:'var(--accent)15',borderRadius:10,padding:'1px 7px',fontSize:9,color:'var(--accent)'}}>🎙️ {p.voice_style}</span>
        </div>
      </div>
    </div>
  )

  return (
    <div style={{minHeight:'100vh',background:'radial-gradient(ellipse at 50% 0%,#1a1a2e 0%,#0a0a12 60%)'}}>
      {hdr}
      <div style={{padding:'16px',maxWidth:440,margin:'0 auto'}}>

        {/* LOBBY */}
        {room.status==='lobby'&&<>
          <div style={{textAlign:'center',marginBottom:16}}>
            <h2 style={{margin:0,fontFamily:'var(--font-display)',fontSize:22,color:'var(--accent)'}}>WAITING FOR PLAYERS</h2>
            <p style={{color:'#666',fontSize:12,margin:'4px 0 0'}}>Share code <b style={{color:'var(--accent)'}}>{roomCode}</b> with friends</p>
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:16}}>{players.map(playerCard)}</div>
          {isHost?<button onClick={startVoting} disabled={players.length<3} style={{width:'100%',padding:14,borderRadius:12,background:players.length>=3?'var(--accent)':'#333',border:'none',color:players.length>=3?'#000':'#666',fontFamily:'var(--font-display)',fontSize:18,cursor:players.length>=3?'pointer':'default'}}>{players.length<3?'NEED '+(3-players.length)+' MORE':'START GAME →'}</button>
          :<div style={{textAlign:'center',color:'#888',fontSize:13,padding:14}}>Waiting for host...</div>}
        </>}

        {/* MODE VOTING */}
        {room.status==='voting'&&<>
          <div style={{textAlign:'center',marginBottom:16}}>
            <h2 style={{margin:0,fontFamily:'var(--font-display)',fontSize:22,color:'var(--accent)'}}>VOTE: GAME MODE</h2>
            <p style={{color:'#666',fontSize:12,margin:'4px 0 0'}}>{myModeVote?'Waiting... ('+modeVotes.length+'/'+players.length+')':'Pick how to play!'}</p>
          </div>
          {!myModeVote?<div style={{display:'flex',flexDirection:'column',gap:8}}>
            {GAME_MODES.map(m=><button key={m.id} onClick={()=>castModeVote(m.id)} style={{background:'#ffffff06',border:'1px solid '+m.color+'33',borderRadius:14,padding:'14px 16px',cursor:'pointer',textAlign:'left',display:'flex',alignItems:'center',gap:12}}>
              <span style={{fontSize:28}}>{m.icon}</span><div><div style={{fontFamily:'var(--font-display)',fontSize:16,color:m.color}}>{m.name}</div><div style={{color:'#888',fontSize:11,marginTop:2}}>{m.desc}</div></div></button>)}
          </div>:<div style={{textAlign:'center',padding:30}}><div style={{fontSize:40,animation:'pulse 1.5s ease infinite'}}>🎲</div><p style={{color:'#aaa',fontSize:13,marginTop:10}}>Voted: <b style={{color:'var(--accent)'}}>{GAME_MODES.find(m=>m.id===myModeVote)?.name}</b></p></div>}
        </>}

        {/* PICK STORY */}
        {room.status==='picking-story'&&<>
          <div style={{textAlign:'center',marginBottom:16}}>
            <div style={{background:'#ffffff08',borderRadius:20,padding:'4px 12px',display:'inline-block',fontSize:12,color:'#aaa',marginBottom:8}}>Mode: <b style={{color:'var(--accent)'}}>{GAME_MODES.find(m=>m.id===room.game_mode)?.name}</b></div>
            <h2 style={{margin:0,fontFamily:'var(--font-display)',fontSize:22,color:'var(--accent)'}}>{isHost?'PICK A STORY':'HOST IS PICKING...'}</h2>
          </div>
          {isHost?<div style={{display:'flex',flexDirection:'column',gap:8}}>
            {Object.entries(STORY_PACKS).map(([k,p])=><button key={k} onClick={()=>pickStory(k)} style={{background:'#ffffff06',border:'1px solid '+p.color+'33',borderRadius:14,padding:16,cursor:'pointer',textAlign:'left',display:'flex',alignItems:'center',gap:14}}>
              <span style={{fontSize:36}}>{p.icon}</span><div><div style={{fontFamily:'var(--font-display)',fontSize:18,color:p.color}}>{p.name}</div><div style={{color:'#888',fontSize:11,marginTop:2}}>{p.prompts.length} prompts • {ROUNDS_PER_GAME} rounds</div></div></button>)}
          </div>:<div style={{textAlign:'center',padding:30}}><div style={{fontSize:40,animation:'pulse 1.5s ease infinite'}}>🤔</div></div>}
        </>}

        {/* RECORDING */}
        {room.status==='recording'&&pack&&<>
          <div style={{textAlign:'center',marginBottom:12}}>
            <div style={{background:'#ffffff08',borderRadius:20,padding:'4px 12px',display:'inline-block',fontSize:12,color:'#aaa',marginBottom:8}}>{pack.icon} {pack.name}</div>
            <div style={{display:'flex',justifyContent:'center',gap:6,marginBottom:4}}>
              {Array.from({length:ROUNDS_PER_GAME},(_,i)=><div key={i} style={{width:28,height:28,borderRadius:'50%',background:i+1<currentRound?pack.color:i+1===currentRound?pack.color+'44':'#ffffff10',border:i+1===currentRound?'2px solid '+pack.color:'2px solid transparent',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,color:i+1<=currentRound?'#fff':'#555',fontFamily:'var(--font-display)'}}>{i+1}</div>)}
            </div>
            <p style={{color:'#888',fontSize:12,margin:0}}>Round {currentRound}/{ROUNDS_PER_GAME} • {playersFinished()}/{players.length} recorded</p>
          </div>
          {!hasRecorded?<>
            <div style={{background:pack.color+'10',border:'2px solid '+pack.color+'44',borderRadius:16,padding:20,marginBottom:16,textAlign:'center'}}>
              <div style={{color:pack.color,fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:2,marginBottom:8}}>{me?.name}, ROUND {currentRound}:</div>
              <div style={{color:'#fff',fontSize:18,fontFamily:'var(--font-display)',lineHeight:1.4}}>{getMyPrompt()?.prompt}</div>
              <div style={{marginTop:10,color:'#888',fontSize:12,fontStyle:'italic',background:'#ffffff06',borderRadius:8,padding:'6px 10px',display:'inline-block'}}>fills in: "___<span style={{color:pack.color}}> {getMyPrompt()?.fill} </span>___"</div>
              {getMyImprovChar()&&<div style={{marginTop:8,color:'#a855f7',fontSize:13,fontWeight:600}}>🎭 Say it as: {getMyImprovChar()}</div>}
            </div>
            <div style={{textAlign:'center'}}>
              {!isRecording?<button onClick={startRec} style={{width:100,height:100,borderRadius:'50%',background:'linear-gradient(135deg,#ff3333,#cc0000)',border:'4px solid #ff333344',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto',boxShadow:'0 0 30px #ff333333'}}><span style={{color:'#fff',fontFamily:'var(--font-display)',fontSize:14}}>TAP TO<br/>RECORD</span></button>
              :<div><button onClick={stopRec} style={{width:100,height:100,borderRadius:'50%',background:'linear-gradient(135deg,#ff3333,#cc0000)',border:'4px solid #ff3333',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto',animation:'recordPulse 1s ease infinite'}}><span style={{color:'#fff',fontFamily:'var(--font-display)',fontSize:26}}>■</span></button>
                <div style={{marginTop:10}}><div style={{width:'80%',height:6,background:'#ffffff10',borderRadius:3,margin:'0 auto',overflow:'hidden'}}><div style={{width:(recordingTime/8*100)+'%',height:'100%',background:'#ff3333',borderRadius:3,transition:'width 0.1s'}}/></div><span style={{color:'#ff3333',fontSize:12,marginTop:4,display:'inline-block'}}>{recordingTime.toFixed(1)}s / 8s</span></div></div>}
              <p style={{color:'#666',fontSize:11,marginTop:10}}>Tap to start, tap to stop (max 8s)</p>
            </div>
          </>:<div style={{textAlign:'center',padding:20}}>
            <div style={{fontSize:48,marginBottom:8}}>✅</div>
            <p style={{color:'#10b981',fontFamily:'var(--font-display)',fontSize:18}}>ROUND {currentRound} RECORDED!</p>
            {myRecording&&<audio controls src={myRecording} style={{marginTop:8,width:'100%',maxWidth:280}}/>}
            <button onClick={redoRec} style={{marginTop:12,padding:'8px 20px',borderRadius:10,background:'#ffffff08',border:'1px solid #ffffff20',color:'#aaa',fontSize:13,cursor:'pointer'}}>🔄 Redo</button>
            <p style={{color:'#888',fontSize:12,marginTop:16}}>{playersFinished()<players.length?'Waiting... ('+playersFinished()+'/'+players.length+')':currentRound<ROUNDS_PER_GAME?'Next round starting...':'Building the story...'}</p>
            <div style={{display:'flex',gap:4,justifyContent:'center',marginTop:8,flexWrap:'wrap'}}>{players.map(p=><span key={p.id} style={{fontSize:22,opacity:recordings.some(r=>r.player_id===p.id&&r.round_number===currentRound)?1:0.3,filter:recordings.some(r=>r.player_id===p.id&&r.round_number===currentRound)?'none':'grayscale(1)'}}>{p.avatar}</span>)}</div>
          </div>}
        </>}

        {/* PLAYBACK WITH AI BRIDGES */}
        {room.status==='playback'&&pack&&<>
          <div style={{textAlign:'center',marginBottom:16}}>
            <h2 style={{margin:0,fontFamily:'var(--font-display)',fontSize:22,color:pack.color}}>{pack.icon} THE STORY {pack.icon}</h2>
            <p style={{color:'#666',fontSize:11,margin:'4px 0 0'}}>{recordings.length} clips with AI narration</p>
          </div>
          {playbackIndex===-1&&!bridgesLoading&&bridges.length>0&&<div style={{marginBottom:16}}>
            <div style={{color:'#888',fontSize:11,marginBottom:6,textAlign:'center'}}>Narrator Voice:</div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:6}}>
              {[{id:'dramatic',label:'Movie Trailer',icon:'🎬'},{id:'sports',label:'ESPN',icon:'📺'},{id:'horror',label:'Horror',icon:'👻'},{id:'nature',label:'Nature Doc',icon:'🌿'}].map(ns=>
                <button key={ns.id} onClick={()=>setNarratorStyle(ns.id)} style={{background:narratorStyle===ns.id?pack.color+'22':'#ffffff08',border:'1px solid '+(narratorStyle===ns.id?pack.color:'#ffffff15'),borderRadius:10,padding:'8px 4px',cursor:'pointer',display:'flex',flexDirection:'column',alignItems:'center',gap:2}}>
                  <span style={{fontSize:18}}>{ns.icon}</span><span style={{color:narratorStyle===ns.id?pack.color:'#888',fontSize:8}}>{ns.label}</span></button>)}
            </div>
          </div>}
          {bridgesLoading?<div style={{textAlign:'center',padding:30}}><div style={{fontSize:40,animation:'spin 2s linear infinite'}}>🤖</div><p style={{color:'#aaa',fontSize:13,marginTop:10}}>AI writing narration...</p></div>
          :playbackIndex===-1?<div style={{textAlign:'center',padding:20}}>
            <p style={{color:'#888',fontSize:13,marginBottom:16}}>{recordings.length} clips shuffled with AI narration!</p>
            <button onClick={startPlayback} style={{padding:'14px 40px',borderRadius:12,background:pack.color,border:'none',color:'#fff',fontFamily:'var(--font-display)',fontSize:18,cursor:'pointer',boxShadow:'0 0 30px '+pack.color+'33'}}>▶ PLAY STORY</button></div>
          :<div style={{display:'flex',flexDirection:'column',gap:8}}>
            {shuffledRecordings.slice(0,Math.max(0,Math.ceil(playbackIndex+1))).map((rec,i)=>{
              const pl=players.find(p=>p.id===rec.player_id); const bridgeText=bridges[i]; const isCurrent=Math.floor(playbackIndex)===i&&!playingBridge
              return <div key={rec.id}>
                {bridgeText&&(playbackIndex>=i-0.5||i===0)&&<div style={{background:'#ffffff04',borderLeft:'3px solid '+pack.color+'44',borderRadius:'0 8px 8px 0',padding:'8px 12px',marginBottom:6,animation:'fadeSlideIn 0.4s ease'}}>
                  <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:2}}><span style={{fontSize:12}}>🤖</span><span style={{color:pack.color,fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:1}}>Narrator</span>
                    {playingBridge&&Math.ceil(playbackIndex)===i&&<div style={{display:'flex',gap:2}}>{[1,2,3].map(b=><div key={b} style={{width:2,background:pack.color,borderRadius:1,animation:'soundBar 0.4s ease '+b*0.1+'s infinite alternate'}}/>)}</div>}
                  </div><p style={{color:'#bbb',fontSize:12,margin:0,fontStyle:'italic',lineHeight:1.4}}>"{bridgeText}"</p></div>}
                <div style={{background:isCurrent?pack.color+'12':'#ffffff06',border:'1px solid '+(isCurrent?pack.color+'44':'#ffffff10'),borderRadius:12,padding:12,animation:'fadeSlideIn 0.4s ease'}}>
                  <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:8}}><span style={{fontSize:24}}>{pl?.avatar}</span><div style={{flex:1}}><div style={{color:'#fff',fontSize:13,fontWeight:600}}>{pl?.name}</div><div style={{color:'#888',fontSize:11,fontStyle:'italic'}}>"{rec.prompt_fill}"</div></div></div>
                  <audio controls src={rec.audio_url} style={{width:'100%',height:36}} autoPlay={isCurrent&&!playingBridge} onEnded={()=>advancePlayback()}/>
                </div></div>})}
            {isPlaybackDone&&bridges[bridges.length-1]&&<div style={{background:'#ffffff04',borderLeft:'3px solid '+pack.color+'44',borderRadius:'0 8px 8px 0',padding:'8px 12px',animation:'fadeSlideIn 0.4s ease'}}>
              <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:2}}><span style={{fontSize:12}}>🤖</span><span style={{color:pack.color,fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:1}}>Narrator</span></div>
              <p style={{color:'#bbb',fontSize:12,margin:0,fontStyle:'italic',lineHeight:1.4}}>"{bridges[bridges.length-1]}"</p></div>}
            {isPlaybackDone&&<div style={{display:'flex',gap:8,marginTop:12}}>
              <button onClick={doReshuffle} style={{flex:1,padding:12,borderRadius:12,background:'#ffffff08',border:'1px solid #ffffff20',color:'#aaa',fontSize:13,cursor:'pointer',fontFamily:'var(--font-display)'}}>🔀 RESHUFFLE</button>
              <button onClick={startAwardVoting} style={{flex:1,padding:12,borderRadius:12,background:'var(--accent)',border:'none',color:'#000',fontSize:13,cursor:'pointer',fontFamily:'var(--font-display)'}}>🏆 VOTE →</button></div>}
          </div>}
        </>}

        {/* VOTING */}
        {room.status==='voting-awards'&&<>
          {voteCategory&&voteCategory!=='done'?<>
            <div style={{textAlign:'center',marginBottom:16}}>
              <h2 style={{margin:0,fontFamily:'var(--font-display)',fontSize:20,color:'var(--accent)'}}>VOTE: {voteCategory==='funniest'?'🏆 Funniest':'🎲 Most Random'}</h2>
              <p style={{color:'#666',fontSize:11,margin:'4px 0 0'}}>Who had the {voteCategory==='funniest'?'funniest':'most random'} clip?</p></div>
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {players.filter(p=>p.id!==playerId).map(p=><button key={p.id} onClick={()=>castAwardVote(voteCategory,p.id)} style={{background:'#ffffff06',border:'1px solid #ffffff15',borderRadius:12,padding:'12px 14px',cursor:'pointer',display:'flex',alignItems:'center',gap:10,textAlign:'left'}}>
                <span style={{fontSize:24}}>{p.avatar}</span><span style={{color:'#fff',fontSize:14}}>{p.name}</span></button>)}</div>
          </>:<>
            {!allVotesDone?<div style={{textAlign:'center',padding:30}}><div style={{fontSize:40,animation:'pulse 1.5s ease infinite'}}>🏆</div><p style={{color:'#aaa',fontSize:13,marginTop:10}}>Waiting for votes... ({votes.length}/{players.length*2})</p></div>
            :<>{(()=>{const{funnyWinner:fw,randomWinner:rw}=getWinners();return<div style={{textAlign:'center'}}>
              <h2 style={{margin:'0 0 20px',fontFamily:'var(--font-display)',fontSize:24,color:'#FFD700'}}>🏆 AWARDS 🏆</h2>
              <div style={{display:'flex',flexDirection:'column',gap:14,marginBottom:24}}>
                {fw&&(()=>{const p=players.find(x=>x.id===fw[0]);return<div style={{background:'#FFD70010',border:'1px solid #FFD70033',borderRadius:16,padding:16}}><div style={{fontSize:40}}>{p?.avatar}</div><div style={{fontFamily:'var(--font-display)',fontSize:18,color:'#FFD700',marginTop:4}}>Funniest Clip</div><div style={{color:'#fff',fontSize:14}}>{p?.name}</div><div style={{color:'#888',fontSize:11}}>{fw[1]} vote{fw[1]!==1?'s':''}</div></div>})()}
                {rw&&(()=>{const p=players.find(x=>x.id===rw[0]);return<div style={{background:'#a855f710',border:'1px solid #a855f733',borderRadius:16,padding:16}}><div style={{fontSize:40}}>{p?.avatar}</div><div style={{fontFamily:'var(--font-display)',fontSize:18,color:'#a855f7',marginTop:4}}>Most Random</div><div style={{color:'#fff',fontSize:14}}>{p?.name}</div><div style={{color:'#888',fontSize:11}}>{rw[1]} vote{rw[1]!==1?'s':''}</div></div>})()}
              </div>
              {isHost&&<button onClick={async()=>{await supabase.from('recordings').delete().eq('room_id',roomId);await supabase.from('votes').delete().eq('room_id',roomId);await supabase.from('mode_votes').delete().eq('room_id',roomId);setMyModeVote(null);setMyRecording(null);setHasRecorded(false);setMyVotes({});setVoteCategory(null);setPlaybackIndex(-1);setShuffledRecordings([]);setBridges([]);setCurrentRound(1);updateRoomStatus('voting',{story_pack:null,game_mode:null})}} style={{width:'100%',padding:14,borderRadius:12,background:'var(--accent)',border:'none',color:'#000',fontFamily:'var(--font-display)',fontSize:18,cursor:'pointer'}}>🔄 PLAY AGAIN</button>}
            </div>})()}</>}
          </>}
        </>}
      </div>
    </div>
  )
}
