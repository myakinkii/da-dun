#   General MIDI definitions for use with midicsv / csvmidi
#   %GM_Patch:      instrument name => program number (0-127)
#   %GM_Percussion: drum name       => note number on channel 9 (35-81)

my @patches = (
  # Piano
  'Acoustic Grand Piano', 'Bright Acoustic Piano', 'Electric Grand Piano', 'Honky-tonk Piano',
  'Electric Piano 1', 'Electric Piano 2', 'Harpsichord', 'Clavinet',
  # Chromatic Percussion
  'Celesta', 'Glockenspiel', 'Music Box', 'Vibraphone',
  'Marimba', 'Xylophone', 'Tubular Bells', 'Dulcimer',
  # Organ
  'Drawbar Organ', 'Percussive Organ', 'Rock Organ', 'Church Organ',
  'Reed Organ', 'Accordion', 'Harmonica', 'Tango Accordion',
  # Guitar
  'Acoustic Guitar (nylon)', 'Acoustic Guitar (steel)', 'Electric Guitar (jazz)', 'Electric Guitar (clean)',
  'Electric Guitar (muted)', 'Overdriven Guitar', 'Distortion Guitar', 'Guitar Harmonics',
  # Bass
  'Acoustic Bass', 'Electric Bass (finger)', 'Electric Bass (pick)', 'Fretless Bass',
  'Slap Bass 1', 'Slap Bass 2', 'Synth Bass 1', 'Synth Bass 2',
  # Strings
  'Violin', 'Viola', 'Cello', 'Contrabass',
  'Tremolo Strings', 'Pizzicato Strings', 'Orchestral Harp', 'Timpani',
  # Ensemble
  'String Ensemble 1', 'String Ensemble 2', 'Synth Strings 1', 'Synth Strings 2',
  'Choir Aahs', 'Voice Oohs', 'Synth Voice', 'Orchestra Hit',
  # Brass
  'Trumpet', 'Trombone', 'Tuba', 'Muted Trumpet',
  'French Horn', 'Brass Section', 'Synth Brass 1', 'Synth Brass 2',
  # Reed
  'Soprano Sax', 'Alto Sax', 'Tenor Sax', 'Baritone Sax',
  'Oboe', 'English Horn', 'Bassoon', 'Clarinet',
  # Pipe
  'Piccolo', 'Flute', 'Recorder', 'Pan Flute',
  'Blown Bottle', 'Shakuhachi', 'Whistle', 'Ocarina',
  # Synth Lead
  'Lead 1 (square)', 'Lead 2 (sawtooth)', 'Lead 3 (calliope)', 'Lead 4 (chiff)',
  'Lead 5 (charang)', 'Lead 6 (voice)', 'Lead 7 (fifths)', 'Lead 8 (bass + lead)',
  # Synth Pad
  'Pad 1 (new age)', 'Pad 2 (warm)', 'Pad 3 (polysynth)', 'Pad 4 (choir)',
  'Pad 5 (bowed)', 'Pad 6 (metallic)', 'Pad 7 (halo)', 'Pad 8 (sweep)',
  # Synth Effects
  'FX 1 (rain)', 'FX 2 (soundtrack)', 'FX 3 (crystal)', 'FX 4 (atmosphere)',
  'FX 5 (brightness)', 'FX 6 (goblins)', 'FX 7 (echoes)', 'FX 8 (sci-fi)',
  # Ethnic
  'Sitar', 'Banjo', 'Shamisen', 'Koto',
  'Kalimba', 'Bagpipe', 'Fiddle', 'Shanai',
  # Percussive
  'Tinkle Bell', 'Agogo', 'Steel Drums', 'Woodblock',
  'Taiko Drum', 'Melodic Tom', 'Synth Drum', 'Reverse Cymbal',
  # Sound Effects
  'Guitar Fret Noise', 'Breath Noise', 'Seashore', 'Bird Tweet',
  'Telephone Ring', 'Helicopter', 'Applause', 'Gunshot',
);
die "general_midi.pl: expected 128 patches, got " . scalar(@patches) . "\n"
    unless @patches == 128;
our %GM_Patch;
@GM_Patch{@patches} = (0 .. 127);

my @drums = (
  'Acoustic Bass Drum', 'Bass Drum 1', 'Side Stick', 'Acoustic Snare',      # 35-38
  'Hand Clap', 'Electric Snare', 'Low Floor Tom', 'Closed Hi-Hat',          # 39-42
  'High Floor Tom', 'Pedal Hi-Hat', 'Low Tom', 'Open Hi-Hat',               # 43-46
  'Low-Mid Tom', 'Hi-Mid Tom', 'Crash Cymbal 1', 'High Tom',                # 47-50
  'Ride Cymbal 1', 'Chinese Cymbal', 'Ride Bell', 'Tambourine',             # 51-54
  'Splash Cymbal', 'Cowbell', 'Crash Cymbal 2', 'Vibraslap',                # 55-58
  'Ride Cymbal 2', 'Hi Bongo', 'Low Bongo', 'Mute Hi Conga',                # 59-62
  'Open Hi Conga', 'Low Conga', 'High Timbale', 'Low Timbale',              # 63-66
  'High Agogo', 'Low Agogo', 'Cabasa', 'Maracas',                           # 67-70
  'Short Whistle', 'Long Whistle', 'Short Guiro', 'Long Guiro',             # 71-74
  'Claves', 'Hi Wood Block', 'Low Wood Block', 'Mute Cuica',                # 75-78
  'Open Cuica', 'Mute Triangle', 'Open Triangle',                           # 79-81
);
die "general_midi.pl: expected 47 drums, got " . scalar(@drums) . "\n"
    unless @drums == 47;
our %GM_Percussion;
@GM_Percussion{@drums} = (35 .. 81);

1;
