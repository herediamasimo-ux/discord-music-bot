import 'dotenv/config';
import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { Player, QueryType } from 'discord-player';
import {
  YouTubeExtractor,
  SpotifyExtractor,
  SoundCloudExtractor
} from '@discord-player/extractor';
import fs from 'node:fs';

const TOKEN  = process.env.TOKEN;
const PREFIX = process.env.PREFIX || '!';
const OWNER  = process.env.OWNER || '';

if (!TOKEN) {
  console.error('Falta la variable TOKEN. Configúrala en Render (Environment Variables).');
  process.exit(1);
}

// ====== Persistencia simple (playlist favorita + modo shuffle) ======
const DB_FILE = 'data.json';
let DB = { favoritePlaylist: '', shuffle: false };

try {
  if (fs.existsSync(DB_FILE)) {
    DB = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  }
} catch (_) {}
const saveDB = () => fs.writeFileSync(DB_FILE, JSON.stringify(DB, null, 2));

// ====== Cliente Discord ======
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

// ====== Reproductor ======
const player = new Player(client, {
  ytdlOptions: { filter: 'audioonly', highWaterMark: 1 << 25, quality: 'highestaudio' }
});

// Extractores: Spotify (lee y busca en YouTube), YouTube y SoundCloud
await player.extractors.register(YouTubeExtractor, {});
await player.extractors.register(SpotifyExtractor, {});
await player.extractors.register(SoundCloudExtractor, {});
await player.extractors.loadDefault();

client.once('ready', () => {
  console.log(`✅ Bot iniciado como ${client.user.tag}`);
});

const reply = (message, txt) =>
  message.channel.send({ content: txt }).catch(() => {});

// Helper: formatear tiempo mm:ss
const fmt = (secTotal) => {
  if (isNaN(secTotal) || secTotal < 0) return '0:00';
  const m = Math.floor(secTotal / 60);
  const s = Math.floor(secTotal % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
};

// ====== Eventos de reproducción ======
player.events.on('playerStart', (queue, track) => {
  // Al empezar una canción, mostrar título y tiempos
  const ts = queue.node.getTimestamp(); // { current, total, progress }
  queue.metadata?.send?.(
    `🎵 **Reproduciendo:** ${track.title}\n⌛ Tiempo: ${ts?.current ?? '0:00'} / ${ts?.total ?? track.duration ?? '—'}`
  ).catch(() => {});
});

player.events.on('playerSkip', (queue, track) => {
  const next = queue.tracks.toArray()[0];
  queue.metadata?.send?.(
    `⏭️ **Saltando...** Ahora suena: ${next ? `**${next.title}**` : '**(cola vacía)**'}`
  ).catch(() => {});
});

player.events.on('error', (q, err) => {
  console.error('Player error:', err);
});

client.on('messageCreate', async (message) => {
  if (!message.guild || message.author.bot) return;
  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const command = (args.shift() || '').toLowerCase();

  // Atajos en español e inglés
  const is = (...names) => names.includes(command);

  const voiceChannel = message.member?.voice?.channel;
  const queue = player.nodes.get(message.guild.id);

  try {
    // ===== Reproducir (Spotify/YouTube/búsqueda) =====
    if (is('reproducir','play','p')) {
      if (!voiceChannel) return reply(message, 'Debes estar en un canal de voz.');
      const query = args.join(' ');
      if (!query) return reply(message, `Uso: \`${PREFIX}reproducir <enlace o búsqueda>\``);

      const { queue: q } = await player.play(voiceChannel, query, {
        requestedBy: message.author,
        searchEngine: QueryType.AUTO,
        nodeOptions: {
          metadata: message.channel,
          leaveOnEmpty: false,
          leaveOnEnd: false,
          leaveOnStop: false,
          volume: 50
        }
      });

      // Si es playlist y el shuffle está activado globalmente, mezclar
      if (DB.shuffle && q && q.tracks.size > 1) {
        q.tracks.shuffle();
        reply(message, '🔀 **Modo aleatorio activo:** se mezcló la cola.');
      }
      return;
    }

    // ===== Pausar / Reanudar =====
    if (is('pausa','pause'))  { if (!queue) return reply(message,'No hay nada reproduciéndose.'); queue.node.pause();  return reply(message,'⏸️ Pausado.'); }
    if (is('resumir','resume','continuar')) { if (!queue) return reply(message,'No hay cola activa.'); queue.node.resume(); return reply(message,'▶️ Reanudado.'); }

    // ===== Saltar / Detener =====
    if (is('saltar','skip','s')) {
      if (!queue) return reply(message,'No hay nada que saltar.');
      const current = queue.currentTrack;
      queue.node.skip(); // el evento playerSkip anunciará el siguiente
      return reply(message, `⏭️ Saltado: **${current?.title || 'desconocido'}**`);
    }

    if (is('parar','stop','detener')) {
      if (!queue) return reply(message,'No hay nada reproduciéndose.');
      queue.delete();
      return reply(message,'⛔ Reproducción detenida y bot desconectado.');
    }

    // ===== Cola y volumen =====
    if (is('cola','queue')) {
      if (!queue || (!queue.currentTrack && queue.tracks.size === 0))
        return reply(message, 'La cola está vacía.');
      const lines = [];
      if (queue.currentTrack) lines.push(`🎵 **Sonando:** ${queue.currentTrack.title}`);
      const list = queue.tracks.toArray().slice(0, 10).map((t,i)=> `${i+1}. ${t.title}`);
      if (list.length) lines.push(...list);
      lines.push(`\n🔀 Aleatorio: **${DB.shuffle ? 'ON' : 'OFF'}**`);
      return reply(message, lines.join('\n'));
    }

    if (is('volumen','volume','vol')) {
      if (!queue) return reply(message,'No hay cola activa.');
      const vol = parseInt(args[0],10);
      if (isNaN(vol) || vol < 0 || vol > 100) return reply(message, `Uso: \`${PREFIX}volumen 0-100\``);
      queue.node.setVolume(vol);
      return reply(message, `🔊 Volumen: **${vol}%**`);
    }

    // ===== Shuffle ON/OFF o toggle =====
    if (is('shuffle')) {
      const arg = (args[0] || '').toLowerCase();
      if (arg === 'on' || arg === 'off') {
        DB.shuffle = (arg === 'on');
        saveDB();
        if (DB.shuffle && queue?.tracks?.size > 1) queue.tracks.shuffle();
        return reply(message, `🔀 Modo aleatorio: **${DB.shuffle ? 'ON' : 'OFF'}**`);
      }
      // toggle
      DB.shuffle = !DB.shuffle;
      saveDB();
      if (DB.shuffle && queue?.tracks?.size > 1) queue.tracks.shuffle();
      return reply(message, `🔀 Modo aleatorio cambiado a: **${DB.shuffle ? 'ON' : 'OFF'}**`);
    }

    // ===== Playlist favorita (set/play/clear) pública =====
    if (is('playlist')) {
      const sub = (args.shift() || '').toLowerCase();
      if (sub === 'set') {
        const url = args[0];
        if (!url) return reply(message, `Uso: \`${PREFIX}playlist set <url>\``);
        DB.favoritePlaylist = url;
        saveDB();
        return reply(message, '✅ Playlist favorita guardada.');
      }
      if (sub === 'play') {
        if (!DB.favoritePlaylist) return reply(message, 'No hay playlist favorita guardada.');
        if (!voiceChannel) return reply(message, 'Debes estar en un canal de voz.');
        const { queue: q } = await player.play(voiceChannel, DB.favoritePlaylist, {
          requestedBy: message.author,
          searchEngine: QueryType.AUTO,
          nodeOptions: {
            metadata: message.channel,
            leaveOnEmpty: false,
            leaveOnEnd: false,
            leaveOnStop: false,
            volume: 50
          }
        });
        if (DB.shuffle && q && q.tracks.size > 1) {
          q.tracks.shuffle();
          reply(message, '🔀 **Modo aleatorio activo:** se mezcló la cola.');
        }
        return;
      }
      if (sub === 'clear') {
        DB.favoritePlaylist = '';
        saveDB();
        return reply(message, '🗑️ Playlist favorita borrada.');
      }
      // ayuda
      return reply(message, [
        'Uso de `playlist`:',
        `\`${PREFIX}playlist set <url>\` — guarda una playlist`,
        `\`${PREFIX}playlist play\` — reproduce la guardada`,
        `\`${PREFIX}playlist clear\` — borra la guardada`
      ].join('\n'));
    }

    // ===== Ayuda =====
    if (is('ayuda','help')) {
      return reply(message, [
        '🤖 **Comandos**',
        `\`${PREFIX}play <spotify/youtube/búsqueda>\` (alias: \`${PREFIX}p\`)`,
        `\`${PREFIX}pause\`, \`${PREFIX}resume\`, \`${PREFIX}s(skip)\`, \`${PREFIX}stop\``,
        `\`${PREFIX}queue\`, \`${PREFIX}volumen 0-100\``,
        `\`${PREFIX}shuffle [on|off]\` (sin arg = toggle)`,
        `\`${PREFIX}playlist set/play/clear\``,
      ].join('\n'));
    }

    if (is('owner') && OWNER) return reply(message, `OWNER: <@${OWNER}>`);

  } catch (err) {
    console.error(err);
    return reply(message, '❌ Ocurrió un error al procesar el comando.');
  }
});

client.login(TOKEN);
