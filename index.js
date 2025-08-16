const { Client, GatewayIntentBits, Partials } = require("discord.js");
const { DisTube } = require("distube");
const { SpotifyPlugin } = require("@distube/spotify");
const { SoundCloudPlugin } = require("@distube/soundcloud");
const { YtDlpPlugin } = require("@distube/yt-dlp");

require("dotenv").config();

// =========================
// CONFIGURACIÓN DEL CLIENTE
// =========================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

// =========================
// CONFIGURACIÓN DE DISTUBE
// =========================
client.distube = new DisTube(client, {
  leaveOnEmpty: true,
  leaveOnFinish: true,
  leaveOnStop: true,
  plugins: [
    new SpotifyPlugin({ emitEventsAfterFetching: true }),
    new SoundCloudPlugin(),
    new YtDlpPlugin()
  ]
});

// =========================
// EVENTOS
// =========================
client.once("ready", () => {
  console.log(`✅ Bot conectado como ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {
  if (!message.content.startsWith(process.env.PREFIX) || message.author.bot) return;

  const args = message.content.slice(process.env.PREFIX.length).trim().split(/ +/g);
  const command = args.shift().toLowerCase();

  if (command === "play") {
    if (!message.member.voice.channel) {
      return message.reply("❌ Debes estar en un canal de voz para usar este comando.");
    }
    client.distube.play(message.member.voice.channel, args.join(" "), {
      textChannel: message.channel,
      member: message.member,
    });
  }

  if (command === "stop") {
    client.distube.stop(message);
    message.channel.send("⏹️ La música ha sido detenida.");
  }

  if (command === "skip") {
    client.distube.skip(message);
    message.channel.send("⏭️ Canción saltada.");
  }
});

// Evento de canciones
client.distube.on("playSong", (queue, song) => {
  queue.textChannel.send(`🎶 Reproduciendo: \`${song.name}\` - \`${song.formattedDuration}\``);
});

// =========================
// LOGIN
// =========================
client.login(process.env.TOKEN);
