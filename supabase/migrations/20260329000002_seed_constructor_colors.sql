-- ============================================================
-- F1-Versus — Seed Constructor Colors
-- Base team colors for the 2024/2025 grid + recent history
-- ============================================================

insert into constructors (constructor_ref, name, color_hex) values
  -- Current grid (2024–2025)
  ('red_bull',       'Red Bull Racing',      '#3671C6'),
  ('mercedes',       'Mercedes',             '#27F4D2'),
  ('ferrari',        'Ferrari',              '#E8002D'),
  ('mclaren',        'McLaren',              '#FF8000'),
  ('aston_martin',   'Aston Martin',         '#229971'),
  ('alpine',         'Alpine',               '#0093CC'),
  ('williams',       'Williams',             '#64C4FF'),
  ('rb',             'RB',                   '#6692FF'),
  ('kick_sauber',    'Kick Sauber',          '#52E252'),
  ('haas',           'Haas F1 Team',         '#B6BABD'),

  -- Recent history
  ('alphatauri',     'AlphaTauri',           '#4E7C99'),
  ('alpha_romeo',    'Alfa Romeo',           '#C92D4B'),
  ('sauber',         'Sauber',               '#9B0000'),
  ('racing_point',   'Racing Point',         '#F596C8'),
  ('force_india',    'Force India',          '#FF80C7'),
  ('renault',        'Renault',              '#FFF500'),
  ('lotus_f1',       'Lotus F1',             '#FFB800'),
  ('manor',          'Manor',                '#FF2929'),
  ('marussia',       'Marussia',             '#6E0000'),
  ('hrt',            'HRT',                  '#C0AB00'),
  ('virgin',         'Virgin',               '#CC0000'),
  ('caterham',       'Caterham',             '#006531'),
  ('toro_rosso',     'Toro Rosso',           '#469BFF'),

  -- Classic teams
  ('brawn',          'Brawn GP',             '#B8FF05'),
  ('honda',          'Honda',                '#FFFFFF'),
  ('bmw_sauber',     'BMW Sauber',           '#0F4AFF'),
  ('toyota',         'Toyota',               '#CC0000'),
  ('super_aguri',    'Super Aguri',          '#CC0000'),
  ('spyker',         'Spyker',               '#FF6600'),
  ('midland',        'MF1 Racing',           '#FF0000'),
  ('jordan',         'Jordan',               '#FFD700'),
  ('jaguar',         'Jaguar Racing',        '#006400'),
  ('bar',            'BAR',                  '#C0C0C0'),
  ('minardi',        'Minardi',              '#191919'),
  ('prost',          'Prost',                '#0055A4'),
  ('arrows',         'Arrows',               '#F58020'),
  ('stewart',        'Stewart',              '#FFFFFF'),
  ('tyrrell',        'Tyrrell',              '#003893'),
  ('benetton',       'Benetton',             '#00A0DE'),
  ('ligier',         'Ligier',               '#003893'),
  ('footwork',       'Footwork',             '#F58020'),
  ('brabham',        'Brabham',              '#006633'),
  ('lotus',          'Lotus',                '#FFD700'),
  ('mclaren_historic', 'McLaren (Classic)',  '#FF8000'),
  ('williams_historic', 'Williams (Classic)','#003087')
on conflict (constructor_ref) do update
  set name      = excluded.name,
      color_hex = excluded.color_hex,
      updated_at = now();
