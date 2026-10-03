//! Integration tests for Workgroup 2 Domain and Persistence Foundation.

use app_lib::state::AppState;
use core_types::{AppError, EnergyProfile, Mode, Setlist, SetlistItem, SetlistItemType, Song};
use tempfile::tempdir;

fn setup_test_app() -> (AppState, tempfile::TempDir) {
    let dir = tempdir().expect("create temp dir");
    let db_path = dir.path().join("test_library.db");
    let state = AppState::new(db_path).expect("initialize app state");
    (state, dir)
}

#[test]
fn test_malformed_song_validation() {
    let (state, _dir) = setup_test_app();

    // 1. Negative duration
    let bad_song1 = Song {
        id: "bad-1".to_string(),
        title: "Bad Duration".to_string(),
        artist: "Artist".to_string(),
        duration_seconds: -10.0,
        bpm: Some(120.0),
        musical_key: Some("8A".to_string()),
        mode: Some(Mode::Minor),
        camelot_code: Some("8A".to_string()),
        tuning: Some("Standard".to_string()),
        capo: Some(0),
        energy_rating: Some(5),
        lead_performer: None,
        tags: vec![],
        notes: None,
    };
    let res1 = upsert_song_core(&state, bad_song1);
    assert!(matches!(res1, Err(AppError::Validation(_))));

    // 2. Out-of-range BPM
    let bad_song2 = Song {
        id: "bad-2".to_string(),
        title: "Bad BPM".to_string(),
        artist: "Artist".to_string(),
        duration_seconds: 180.0,
        bpm: Some(999.0),
        musical_key: Some("8A".to_string()),
        mode: Some(Mode::Minor),
        camelot_code: Some("8A".to_string()),
        tuning: Some("Standard".to_string()),
        capo: Some(0),
        energy_rating: Some(5),
        lead_performer: None,
        tags: vec![],
        notes: None,
    };
    let res2 = upsert_song_core(&state, bad_song2);
    assert!(matches!(res2, Err(AppError::Validation(_))));

    // 3. Out-of-range Energy Rating (0 or > 10)
    let bad_song3 = Song {
        id: "bad-3".to_string(),
        title: "Bad Energy".to_string(),
        artist: "Artist".to_string(),
        duration_seconds: 180.0,
        bpm: Some(120.0),
        musical_key: Some("8A".to_string()),
        mode: Some(Mode::Minor),
        camelot_code: Some("8A".to_string()),
        tuning: Some("Standard".to_string()),
        capo: Some(0),
        energy_rating: Some(15),
        lead_performer: None,
        tags: vec![],
        notes: None,
    };
    let res3 = upsert_song_core(&state, bad_song3);
    assert!(matches!(res3, Err(AppError::Validation(_))));

    // 4. Invalid Key notation
    let bad_song4 = Song {
        id: "bad-4".to_string(),
        title: "Bad Key".to_string(),
        artist: "Artist".to_string(),
        duration_seconds: 180.0,
        bpm: Some(120.0),
        musical_key: Some("NonExistentKey123".to_string()),
        mode: Some(Mode::Minor),
        camelot_code: Some("8A".to_string()),
        tuning: Some("Standard".to_string()),
        capo: Some(0),
        energy_rating: Some(5),
        lead_performer: None,
        tags: vec![],
        notes: None,
    };
    let res4 = upsert_song_core(&state, bad_song4);
    assert!(matches!(res4, Err(AppError::Validation(_))));
}

#[test]
fn test_malformed_setlist_validation() {
    let (state, _dir) = setup_test_app();

    // 1. Empty ID and name
    let bad_setlist1 = Setlist::new("", "", EnergyProfile::Wave, vec![]);
    let res1 = save_setlist_core(&state, bad_setlist1);
    assert!(matches!(res1, Err(AppError::Validation(_))));

    // 2. Non-sequential duplicate positions
    let bad_setlist2 = Setlist::new(
        "bad-set-1",
        "Duplicate Positions",
        EnergyProfile::PeakPlateau,
        vec![
            SetlistItem {
                id: "i1".to_string(),
                position: 1,
                item: SetlistItemType::Banter {
                    topic: "Intro".to_string(),
                    duration_seconds: Some(30.0),
                },
                transition: None,
                target_energy: None,
                notes: None,
            },
            SetlistItem {
                id: "i2".to_string(),
                position: 1, // Duplicate position!
                item: SetlistItemType::Banter {
                    topic: "More Intro".to_string(),
                    duration_seconds: Some(30.0),
                },
                transition: None,
                target_energy: None,
                notes: None,
            },
        ],
    );
    let res2 = save_setlist_core(&state, bad_setlist2);
    assert!(matches!(res2, Err(AppError::Validation(_))));
}

#[test]
fn test_active_setlist_across_restarts() {
    let dir = tempdir().expect("create temp dir");
    let db_path = dir.path().join("persist_library.db");

    // Session 1: Create song, build setlist with mixed items, save active
    {
        let state = AppState::new(db_path.clone()).expect("init state 1");

        let song = Song {
            id: "s1".to_string(),
            title: "Midnight City".to_string(),
            artist: "M83".to_string(),
            duration_seconds: 243.0,
            bpm: Some(105.0),
            musical_key: Some("4B".to_string()),
            mode: Some(Mode::Major),
            camelot_code: Some("4B".to_string()),
            tuning: Some("Standard".to_string()),
            capo: Some(0),
            energy_rating: Some(7),
            lead_performer: None,
            tags: vec!["synthpop".to_string()],
            notes: None,
        };
        upsert_song_core(&state, song.clone()).expect("upsert song");

        let setlist = Setlist::new(
            "active-set-1",
            "Saturday Night Live",
            EnergyProfile::Wave,
            vec![
                SetlistItem {
                    id: "it-1".to_string(),
                    position: 1,
                    item: SetlistItemType::Song {
                        song_id: "s1".to_string(),
                        song: Some(song),
                    },
                    transition: None,
                    target_energy: Some(6.0),
                    notes: None,
                },
                SetlistItem {
                    id: "it-2".to_string(),
                    position: 2,
                    item: SetlistItemType::Banter {
                        topic: "Crowd shoutout".to_string(),
                        duration_seconds: Some(20.0),
                    },
                    transition: None,
                    target_energy: Some(4.0),
                    notes: None,
                },
                SetlistItem {
                    id: "it-3".to_string(),
                    position: 3,
                    item: SetlistItemType::Intermission {
                        duration_seconds: 600.0,
                        notes: Some("10 min intermission".to_string()),
                    },
                    transition: None,
                    target_energy: None,
                    notes: None,
                },
            ],
        );

        save_active_setlist_core(&state, setlist).expect("save active setlist");
    }

    // Session 2: Reopen database and verify active setlist is preserved perfectly
    {
        let state = AppState::new(db_path).expect("init state 2");
        let active = get_active_setlist_core(&state)
            .expect("get active setlist")
            .expect("active setlist should exist");

        assert_eq!(active.id, "active-set-1");
        assert_eq!(active.name, "Saturday Night Live");
        assert_eq!(active.energy_profile, EnergyProfile::Wave);
        assert_eq!(active.items.len(), 3);
        assert_eq!(active.items[0].position, 1);
        assert!(matches!(active.items[0].item, SetlistItemType::Song { .. }));
        assert_eq!(active.items[1].position, 2);
        assert!(matches!(
            active.items[1].item,
            SetlistItemType::Banter { .. }
        ));
        assert_eq!(active.items[2].position, 3);
        assert!(matches!(
            active.items[2].item,
            SetlistItemType::Intermission { .. }
        ));
    }
}

// Helpers for headless command testing without State<'_, AppState>
fn upsert_song_core(state: &AppState, song: Song) -> Result<String, AppError> {
    core_types::validate_song(&song).map_err(AppError::from)?;
    let conn = state
        .db
        .lock()
        .map_err(|e| AppError::database(e.to_string()))?;
    library_db::upsert_song(&conn, &song).map_err(|e| AppError::database(e.to_string()))
}

fn save_setlist_core(state: &AppState, setlist: Setlist) -> Result<(), AppError> {
    core_types::validate_setlist(&setlist).map_err(AppError::from)?;
    let conn = state
        .db
        .lock()
        .map_err(|e| AppError::database(e.to_string()))?;
    library_db::save_setlist(&conn, &setlist).map_err(|e| AppError::database(e.to_string()))
}

fn save_active_setlist_core(state: &AppState, setlist: Setlist) -> Result<(), AppError> {
    core_types::validate_setlist(&setlist).map_err(AppError::from)?;
    let conn = state
        .db
        .lock()
        .map_err(|e| AppError::database(e.to_string()))?;
    library_db::save_active_setlist(&conn, &setlist).map_err(|e| AppError::database(e.to_string()))
}

fn get_active_setlist_core(state: &AppState) -> Result<Option<Setlist>, AppError> {
    let conn = state
        .db
        .lock()
        .map_err(|e| AppError::database(e.to_string()))?;
    library_db::get_active_setlist(&conn).map_err(|e| AppError::database(e.to_string()))
}
