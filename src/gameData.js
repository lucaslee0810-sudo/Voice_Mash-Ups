export const STORY_PACKS = {
  horror: {
    name: "Horror Night",
    icon: "👻",
    color: "#ff3333",
    prompts: [
      { fill: "a scary sound", prompt: "Make a scary sound you'd hear in a haunted house!" },
      { fill: "what the monster looks like", prompt: "Describe what the monster looks like!" },
      { fill: "how the monster smells", prompt: "Describe how the monster smells!" },
      { fill: "what the hero yells", prompt: "Yell what the hero screams when they see the monster!" },
      { fill: "the secret weapon", prompt: "Name the weird secret weapon that defeats the monster!" },
      { fill: "how it ends", prompt: "Tell us the plot twist ending!" },
    ],
  },
  space: {
    name: "Space Mission",
    icon: "🚀",
    color: "#3b82f6",
    prompts: [
      { fill: "the ship's name", prompt: "Say the name of your spaceship in a dramatic voice!" },
      { fill: "what mission control says", prompt: "You're mission control — give the launch countdown your way!" },
      { fill: "what the alien looks like", prompt: "Describe the alien you just discovered!" },
      { fill: "the alien's greeting", prompt: "Do your best alien greeting voice!" },
      { fill: "what goes wrong", prompt: "Yell out what just went wrong on the ship!" },
      { fill: "the captain's speech", prompt: "Give a dramatic captain's speech to save the crew!" },
    ],
  },
  cooking: {
    name: "Cooking Disaster",
    icon: "🍳",
    color: "#f59e0b",
    prompts: [
      { fill: "the dish name", prompt: "Announce the name of your made-up dish like a fancy chef!" },
      { fill: "the secret ingredient", prompt: "Whisper the secret ingredient dramatically!" },
      { fill: "what it tastes like", prompt: "Describe the taste with your full emotions!" },
      { fill: "the judge's reaction", prompt: "You're the judge — give your honest (brutal) reaction!" },
      { fill: "what catches fire", prompt: "Yell about what just caught on fire in the kitchen!" },
      { fill: "the final score", prompt: "Announce the final score and whether they're going home!" },
    ],
  },
  school: {
    name: "School Gone Wrong",
    icon: "🏫",
    color: "#10b981",
    prompts: [
      { fill: "morning announcement", prompt: "Do the morning announcement in the principal's voice!" },
      { fill: "the excuse", prompt: "Give your best excuse for why homework isn't done!" },
      { fill: "cafeteria discovery", prompt: "Describe what you found in the cafeteria food!" },
      { fill: "the substitute teacher", prompt: "Describe the weirdest substitute teacher ever!" },
      { fill: "fire drill chaos", prompt: "Narrate what happens during the craziest fire drill!" },
      { fill: "the ending", prompt: "How does this school day end? Make it dramatic!" },
    ],
  },
  sports: {
    name: "Championship Game",
    icon: "🏆",
    color: "#a855f7",
    prompts: [
      { fill: "team intro", prompt: "Introduce the team in your best announcer voice!" },
      { fill: "pre-game hype", prompt: "Give the locker room hype speech!" },
      { fill: "the big play", prompt: "Call the play-by-play of the craziest play ever!" },
      { fill: "the ref's call", prompt: "You're the ref — make the most controversial call!" },
      { fill: "crowd reaction", prompt: "Be the crowd — react to what just happened!" },
      { fill: "post-game interview", prompt: "Give the post-game interview as the MVP!" },
    ],
  },
};

export const GAME_MODES = [
  { id: "prompt", name: "Classic", icon: "🎤", desc: "Everyone gets a unique Mad Libs prompt. Clips get shuffled into a story.", color: "#3b82f6" },
  { id: "same", name: "Same Prompt", icon: "🎯", desc: "Everyone gets the SAME prompt. Hear how different everyone's answer is!", color: "#f59e0b" },
  { id: "chain", name: "Telephone", icon: "🔗", desc: "Each player only hears the LAST person's clip before recording theirs.", color: "#10b981" },
  { id: "improv", name: "Improv", icon: "🎭", desc: "AI assigns each player a character to play. Stay in character!", color: "#a855f7" },
];

export const IMPROV_CHARACTERS = [
  "an angry chef", "a confused astronaut", "a dramatic news anchor", "a sleepy pirate",
  "a robot learning emotions", "a cowboy at a tech company", "a vampire at the dentist",
  "a spy who's bad at whispering", "a grandma who's a secret agent", "a ghost who's afraid of people"
];

export const AVATAR_OPTIONS = ["😎", "🤠", "👽", "🤖", "🦊", "🐸", "🦁", "🐻", "🎃", "👾", "🧙", "🦄", "🐲", "🦈", "🦅", "🐒"];

export const FAVE_CATEGORIES = [
  { key: "sport", label: "Sport", dbKey: "fave_sport", options: ["Basketball", "Football", "Soccer", "Baseball", "Swimming", "Skateboarding", "None"] },
  { key: "food", label: "Food", dbKey: "fave_food", options: ["Pizza", "Tacos", "Sushi", "Burgers", "Chicken Nuggets", "Mac & Cheese", "Ramen"] },
  { key: "game", label: "Game", dbKey: "fave_game", options: ["Minecraft", "Fortnite", "Roblox", "Mario", "Pokémon", "FIFA", "Zelda"] },
];

export const VOICE_STYLES = [
  { id: "normal", label: "Normal", icon: "🗣️" },
  { id: "robot", label: "Robot", icon: "🤖" },
  { id: "deep", label: "Deep", icon: "👹" },
  { id: "chipmunk", label: "Chipmunk", icon: "🐿️" },
  { id: "echo", label: "Echo", icon: "🌀" },
];
