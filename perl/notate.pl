#!/usr/bin/perl
#   notate.pl -- turn a quick text music sketch into midicsv CSV
#   Usage: perl notate.pl song.txt | csvmidi > song.mid
#
#   Header lines:   title Some Name     tempo 120     time 4/4
#   Melody parts:   piano: r8 g' g g | >eb2 | [c e g]4 ...
#     notes   a-g, then # or b (sharp/flat), then ' (octave up) or , (down)
#             Notes are in the line's octave: 4 (from middle C up to B) unless
#             the part line says otherwise, e.g. "piano (left) o3:"; bass
#             instruments default to octave 2.
#     o5      switch the octave for the rest of the line
#     1 2 4 8 16 32   durations (whole..32nd), "." dotted; durations stick
#     8t 4t 16t     triplets (three in the time of two)
#     r       rest       R  rest to end of bar
#     ~ tie into next note      > accent (louder)
#     [c e g] chord, >[c e g] accented chord
#     |       bar line (checked against the time signature)
#     @15     continue from bar 15 (works in drum lines too)
#   Drum parts (one line per sound, each character is a 16th note):
#     kick:  |x...x...x...x...|      x hit, X accented hit, . or - silence
#   Same part name twice continues the part. "piano (left):" makes a
#   separate part with the same instrument.

use strict;
use warnings;
use FindBin;
use lib $FindBin::Bin;
our (%GM_Patch, %GM_Percussion);
require "$FindBin::Bin/general_midi.pl";

my $PPQ = 480;
my %INST_ALIAS = (
    'piano' => 0, 'grand piano' => 0, 'electric piano' => 4, 'epiano' => 4, 'rhodes' => 4,
    'harpsichord' => 6, 'bells' => 14, 'organ' => 16, 'rock organ' => 18,
    'guitar' => 25, 'acoustic guitar' => 25, 'nylon guitar' => 24, 'electric guitar' => 27,
    'clean guitar' => 27, 'muted guitar' => 28, 'overdrive' => 29, 'distortion' => 30,
    'bass' => 33, 'electric bass' => 33, 'pick bass' => 34, 'slap bass' => 36, 'synth bass' => 38,
    'strings' => 48, 'string ensemble' => 48, 'pizzicato' => 45, 'harp' => 46,
    'choir' => 52, 'voice' => 53, 'trumpet' => 56, 'trombone' => 57, 'horn' => 60,
    'brass' => 61, 'sax' => 65, 'saxophone' => 65, 'flute' => 73,
    'lead' => 80, 'square lead' => 80, 'saw lead' => 81, 'pad' => 89, 'warm pad' => 89,
);
my %DRUM_ALIAS = (
    'kick' => 36, 'bd' => 36, 'bass drum' => 36, 'snare' => 38, 'sd' => 38, 'clap' => 39,
    'hat' => 42, 'hh' => 42, 'hihat' => 42, 'hi-hat' => 42, 'closed hat' => 42,
    'open hat' => 46, 'oh' => 46, 'pedal hat' => 44, 'crash' => 49, 'ride' => 51,
    'ride bell' => 53, 'rim' => 37, 'side stick' => 37, 'high tom' => 50, 'tom' => 47,
    'mid tom' => 47, 'low tom' => 45, 'floor tom' => 41, 'cowbell' => 56,
    'tambourine' => 54, 'shaker' => 70, 'claves' => 75,
);
my %PATCH_LC = map { lc($_) => $GM_Patch{$_} } keys %GM_Patch;
my %DRUM_LC  = map { lc($_) => $GM_Percussion{$_} } keys %GM_Percussion;
my %STEP = (c => 0, d => 1, e => 2, f => 3, g => 4, a => 5, b => 6);
my @SEMI = (0, 2, 4, 5, 7, 9, 11);

my ($title, $tempo, $tsn, $tsd) = ('Untitled', 120, 4, 4);
my (@parts, %part_by_key, $warnings);
$warnings = 0;
sub warn_at { my ($line, $msg) = @_; print STDERR "line $line: $msg\n"; $warnings++; }

sub resolve_instrument {
    my ($name, $line) = @_;
    my $n = lc $name; $n =~ s/\s+/ /g;
    return ('drum', $DRUM_ALIAS{$n}) if exists $DRUM_ALIAS{$n};
    return ('drum', $DRUM_LC{$n})    if exists $DRUM_LC{$n};
    return ('inst', $INST_ALIAS{$n}) if exists $INST_ALIAS{$n};
    return ('inst', $PATCH_LC{$n})   if exists $PATCH_LC{$n};
    my @m = grep { index($_, $n) >= 0 } keys %PATCH_LC;
    return ('inst', $PATCH_LC{$m[0]}) if @m == 1;
    die "line $line: unknown instrument or drum \"$name\""
        . (@m ? " (could be: " . join(', ', sort @m) . ")" : "") . "\n";
}

# ---- read input ----
my $ln = 0;
while (my $l = <>) {
    $ln++;
    $l =~ s/(^|\s)#.*$//; $l =~ s/^\s+|\s+$//g;
    next if $l eq '';
    if    ($l =~ /^title\s+(.+)$/i)         { $title = $1; }
    elsif ($l =~ /^tempo\s+(\d+(?:\.\d+)?)$/i) { $tempo = $1; }
    elsif ($l =~ /^time\s+(\d+)\s*\/\s*(\d+)$/i) { ($tsn, $tsd) = ($1, $2); }
    elsif ($l =~ /^([A-Za-z][\w\s\-\+]*?)\s*(\(([^)]*)\))?\s*(?:o(\d))?\s*:\s*(.*)$/) {
        my ($name, $label, $loct, $body) = ($1, $3, $4, $5);
        my $key = lc($name) . (defined $label ? " ($label)" : '');
        my $p = $part_by_key{$key};
        unless ($p) {
            my ($kind, $num) = resolve_instrument($name, $ln);
            $p = { name => $name . (defined $label ? " ($label)" : ''), kind => $kind,
                   num => $num, chunks => [] };
            $part_by_key{$key} = $p; push @parts, $p;
        }
        push @{$p->{chunks}}, [$ln, $body, $loct];
    }
    else { die "line $ln: can't understand \"$l\"\n"; }
}
die "No parts found. Write a line like:  piano: c d e f g2\n" unless @parts;

my $bar_ticks = int($tsn * 4 * $PPQ / $tsd);

# ---- melody parts ----
sub parse_melody {
    my ($p) = @_;
    my @ev;                       # [tick, on/off, note, vel]
    my $t = 0; my $dur = $PPQ;    # sticky duration
    my $default_oct = ($p->{num} >= 32 && $p->{num} <= 39) ? 2 : 4;   # bass instruments: octave 2
    my @tied;                     # notes currently held by a tie
    my $bar_start = 0; my $bar_no = 1;
    for my $c (@{$p->{chunks}}) {
        my ($line, $body, $loct) = @$c;
        my $oct = $loct // $default_oct;      # each line starts in its own octave
        for my $tok ($body =~ /(>?\[[^\]]*\][^\s|]*|[^\s|]+|\|)/g) {
            if ($tok eq '|') {
                my $len = $t - $bar_start;
                if ($len != $bar_ticks && !($bar_no == 1 && $len < $bar_ticks && $len > 0)) {
                    warn_at($line, sprintf("%s, bar %d has %s beats, expected %s",
                        $p->{name}, $bar_no, $len / $PPQ * $tsd / 4, $tsn));
                }
                $bar_start = $t; $bar_no++; next;
            }
            if ($tok =~ /^o(\d)$/) { $oct = $1; next; }
            if ($tok =~ /^@(\d+)$/) {         # continue from bar N (rest until then)
                my $target = ($1 - 1) * $bar_ticks;
                if ($1 < 1 || $target < $t) { warn_at($line, "$p->{name}: \@$1, but this part is already past the start of bar $1"); next; }
                push @ev, [$t, 0, $_, 0] for @tied; @tied = ();
                $t = $target; $bar_start = $t; $bar_no = $1; next;
            }
            if ($tok eq 'R') {            # rest until the end of the bar
                my $left = $bar_ticks - ($t - $bar_start);
                if ($left <= 0) { warn_at($line, "$p->{name}: R in bar $bar_no, but that bar is already full"); next; }
                push @ev, [$t, 0, $_, 0] for @tied; @tied = ();
                $t += $left; next;
            }
            my ($acc, $what, $num, $trip, $dots, $tie) =
                $tok =~ /^(>?)(\[[^\]]*\]|[a-gA-G](?:#|b)?[',]*|r)(\d+)?(t?)(\.*)(~?)$/
                or (warn_at($line, "$p->{name}: can't read \"$tok\""), next);
            if (defined $num) {
                unless ($num =~ /^(1|2|4|8|16|32|64)$/) { warn_at($line, "$p->{name}: duration $num isn't 1,2,4,8,16,32"); next; }
                $dur = 4 * $PPQ / $num;
                $dur = $dur * 2 / 3 if $trip;     # triplet: 3 in the time of 2
                my $add = $dur; for (1 .. length $dots) { $add /= 2; $dur += $add; }
            } elsif ($trip) {
                warn_at($line, "$p->{name}: \"t\" needs a number in front, like 8t"); next;
            } elsif (length $dots) {
                $dur = 4 * $PPQ / 4; my $add = $dur; for (1 .. length $dots) { $add /= 2; $dur += $add; }
            }
            my $vel = $acc ? 115 : 82;
            my @pitches;
            if ($what ne 'r') {
                my @names = $what =~ /^\[/ ? (substr($what, 1, -1) =~ /\S+/g) : ($what);
                for my $n (@names) {
                    my ($letter, $accd, $marks) = $n =~ /^([a-gA-G])(#|b)?([',]*)$/
                        or (warn_at($line, "$p->{name}: bad note \"$n\" in chord"), next);
                    my $o = $oct + (() = $marks =~ /'/g) - (() = $marks =~ /,/g);
                    my $midi = ($o + 1) * 12 + $SEMI[$STEP{lc $letter}]
                             + (($accd // '') eq '#' ? 1 : ($accd // '') eq 'b' ? -1 : 0);
                    push @pitches, $midi;
                }
            }
            # resolve ties from previous token
            my %cont;
            if (@tied) {
                my %want = map { $_ => 1 } @pitches;
                for my $h (@tied) {
                    if ($want{$h}) { $cont{$h} = 1; } else { push @ev, [$t, 0, $h, 0]; }
                }
                @tied = ();
            }
            my $gap = $tie ? 0 : ($dur >= 120 ? 30 : int($dur / 4));
            for my $m (@pitches) {
                if ($m < 0 || $m > 127) { warn_at($line, "$p->{name}: note out of MIDI range"); next; }
                push @ev, [$t, 1, $m, $vel] unless $cont{$m};
                if ($tie) { push @tied, $m; } else { push @ev, [$t + $dur - $gap, 0, $m, 0]; }
            }
            $t += $dur;
        }
    }
    push @ev, [$t, 0, $_, 0] for @tied;
    return (\@ev, $t);
}

# ---- drum parts ----
sub parse_drum {
    my ($p) = @_;
    my @ev; my $t = 0; my $step = $PPQ / 4; my $bar_steps = $bar_ticks / $step;
    my $n = $p->{num};
    for my $c (@{$p->{chunks}}) {
        my ($line, $body) = @$c;
        $body =~ s/\s+//g;
        for my $piece (split /(@\d+)/, $body) {
          if ($piece =~ /^@(\d+)$/) {          # continue from bar N
              my $target = ($1 - 1) * $bar_ticks;
              if ($1 < 1 || $target < $t) { warn_at($line, "$p->{name}: \@$1, but this part is already past the start of bar $1"); }
              else { $t = $target; }
              next;
          }
          for my $bar (split /\|/, $piece) {
            next if $bar eq '';
            warn_at($line, "$p->{name}: bar \"$bar\" has " . length($bar) . " steps, expected $bar_steps")
                if length($bar) != $bar_steps;
            for my $ch (split //, $bar) {
                if ($ch eq 'x' || $ch eq 'X') {
                    my $v = $ch eq 'X' ? 120 : 90;
                    push @ev, [$t, 1, $n, $v], [$t + $step / 2, 0, $n, 0];
                } elsif ($ch ne '.' && $ch ne '-') {
                    warn_at($line, "$p->{name}: \"$ch\" isn't x, X, . or -");
                }
                $t += $step;
            }
          }
        }
    }
    return (\@ev, $t);
}

# ---- assemble tracks ----
my @tracks; my $end = 0; my $chan = 0; my (@drum_ev, $drum_end, @drum_names);
$drum_end = 0;
for my $p (@parts) {
    if ($p->{kind} eq 'drum') {
        my ($ev, $len) = parse_drum($p);
        push @drum_ev, @$ev; $drum_end = $len if $len > $drum_end; push @drum_names, $p->{name};
        next;
    }
    $chan++ if $chan == 9;
    die "Too many melody parts (max 15)\n" if $chan > 15;
    my ($ev, $len) = parse_melody($p);
    push @tracks, { name => $p->{name}, chan => $chan, prog => $p->{num}, ev => $ev, len => $len };
    $chan++;
}
push @tracks, { name => 'Drums', chan => 9, prog => undef, ev => \@drum_ev, len => $drum_end } if @drum_ev;
for (@tracks) { $end = $_->{len} if $_->{len} > $end; }

(my $qt = $title) =~ s/"/""/g;
my $den_pow = int(log($tsd) / log(2) + 0.5);
print "0, 0, Header, 1, ", scalar(@tracks) + 1, ", $PPQ\n";
print "1, 0, Start_track\n1, 0, Title_t, \"$qt\"\n";
print "1, 0, Time_signature, $tsn, $den_pow, 24, 8\n";
print "1, 0, Tempo, ", int(60_000_000 / $tempo + 0.5), "\n1, $end, End_track\n";
my $tn = 2;
for my $tr (@tracks) {
    (my $nm = $tr->{name}) =~ s/"/""/g;
    print "$tn, 0, Start_track\n$tn, 0, Title_t, \"$nm\"\n";
    print "$tn, 0, Program_c, $tr->{chan}, $tr->{prog}\n" if defined $tr->{prog};
    my $last = 0;
    for my $e (sort { $a->[0] <=> $b->[0] || $a->[1] <=> $b->[1] } @{$tr->{ev}}) {
        my ($t, $on, $n, $v) = @$e;
        print "$tn, $t, ", ($on ? "Note_on_c" : "Note_off_c"), ", $tr->{chan}, $n, $v\n";
        $last = $t if $t > $last;
    }
    print "$tn, $last, End_track\n";
    $tn++;
}
print "0, 0, End_of_file\n";
print STDERR "$warnings warning(s)\n" if $warnings;
