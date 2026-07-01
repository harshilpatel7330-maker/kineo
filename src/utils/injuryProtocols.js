export const PROTOCOLS = {

  'stress-fracture-risk': {
    description: 'A stress reaction or stress fracture is a small crack or severe bruising in a bone, usually caused by repetitive impact loading before the bone can repair itself. This is a medical emergency for athletes — returning to impact activity too soon can cause a complete fracture.',
    immediateActions: [
      'Stop all running and jumping immediately — zero impact loading.',
      'Switch to pool running, swimming, or cycling only until medically evaluated.',
      'Seek an appointment with a sports medicine physician or GP within 48 hours.',
      'Do not return to impact activity without clearance from a medical professional.',
    ],
    returnToTraining: [
      { day: '1–14', instruction: 'Zero impact. Pool running or cycling only. Imaging and medical evaluation.' },
      { day: '15–28', instruction: 'If imaging is clear, begin walk/jog intervals on soft surfaces under medical guidance.' },
      { day: '29–42', instruction: 'Gradual return: max 50% of pre-injury weekly mileage, easy pace only.' },
      { day: '43+', instruction: 'Progressive rebuild under physio guidance. Add 10% per week maximum.' },
    ],
    watchFor: [
      'Pain that worsens with walking or at rest',
      'Swelling or visible bruising over the bone',
      'Point tenderness when pressing on a specific spot',
      'Pain that does not improve within 2–3 days of complete rest',
    ],
    escalationCriteria: 'If pain worsens, you develop swelling, or pain is present at rest, go to urgent care — a displaced fracture requires immediate attention.',
    disclaimer: 'This is not a diagnosis. A bone scan or MRI is required to confirm a stress fracture. Do not resume impact activity without medical clearance.',
  },

  'shin-splints': {
    description: 'Shin splints (Medial Tibial Stress Syndrome) is inflammation of the muscles, tendons, and bone tissue around the shin. It\'s the most common running overuse injury, typically caused by a rapid increase in training volume or intensity.',
    immediateActions: [
      'Reduce running volume by 30–50% this week.',
      'Swap runs for pool running or cycling for 2–3 days.',
      'Ice the shin for 15–20 minutes after any activity.',
      'Avoid hills, camber, and hard surfaces.',
    ],
    returnToTraining: [
      { day: '1–3', instruction: 'Pool running or cycling — zero impact loading.' },
      { day: '4–7', instruction: 'Easy 10–20 minute jog on soft surface if pain score is 2 or below.' },
      { day: '8–14', instruction: 'Gradual return to regular running, adding no more than 10% per week.' },
      { day: '15+', instruction: 'Resume normal training with ongoing load monitoring.' },
    ],
    watchFor: [
      'Pain that gets worse as you run (not better after warm-up)',
      'Pain at rest or when the shin is pressed in a single spot — this can indicate a stress fracture',
      'Swelling along the shin bone',
      'Score rising above 5/10',
    ],
    escalationCriteria: 'If pain does not improve within 2 weeks of reduced load, or score reaches 6+ or becomes point-tender on the bone, seek medical evaluation to rule out a stress fracture.',
    disclaimer: 'Shin splints that don\'t improve with rest can progress to stress fractures. Persistent or worsening pain should be evaluated by a sports medicine professional.',
  },

  'achilles-tendinopathy': {
    description: 'Achilles tendinopathy is degeneration of the Achilles tendon from repetitive loading without adequate recovery. It presents as pain and stiffness at the back of the ankle, typically worst in the morning and after exercise.',
    immediateActions: [
      'Reduce running volume by 40–50% immediately.',
      'Avoid hill running and speed work until pain-free.',
      'Begin eccentric heel drops: 3 sets of 15 off a step, twice daily.',
      'Ice after exercise, but avoid icing before — the tendon needs blood flow to heal.',
    ],
    returnToTraining: [
      { day: '1–7', instruction: 'Eccentric strengthening only. Cycling or swimming if tolerated.' },
      { day: '8–14', instruction: 'Easy running on flat surfaces if morning stiffness resolves within 10 minutes.' },
      { day: '15–21', instruction: 'Gradual volume return at 10% per week — no speed work.' },
      { day: '22+', instruction: 'Introduce hills and tempo only when completely pain-free at 80% of normal volume.' },
    ],
    watchFor: [
      'Pain that worsens during a run rather than improving after warm-up',
      'Swelling or thickening of the tendon',
      'A sudden sharp pain followed by difficulty walking — this may indicate a tear',
      'Morning stiffness lasting more than 30 minutes',
    ],
    escalationCriteria: 'If pain score reaches 6+ or you hear/feel a pop in the tendon, stop immediately and seek emergency care — this may indicate a tendon rupture.',
    disclaimer: 'Tendinopathy responds well to progressive loading, but improper return to training can cause a tendon rupture. Persistent cases should be assessed by a physiotherapist.',
  },

  'plantar-fasciitis': {
    description: 'Plantar fasciitis is inflammation of the thick band of tissue that runs across the bottom of your foot, connecting your heel bone to your toes. It typically causes a sharp stabbing pain near the heel, worst with the first steps in the morning.',
    immediateActions: [
      'Reduce running volume by 30–40% this week.',
      'Stretch the plantar fascia: 30-second holds, 3x per foot, morning and evening.',
      'Use supportive footwear or orthotics — avoid barefoot walking on hard floors.',
      'Apply ice to the heel for 15 minutes after activity.',
    ],
    returnToTraining: [
      { day: '1–7', instruction: 'Stretching and gentle mobilisation. Cycling tolerated if pain-free.' },
      { day: '8–14', instruction: 'Easy running if morning pain is 1/10 or below and resolves quickly.' },
      { day: '15–21', instruction: 'Gradual mileage increase at 10% per week — avoid speed work and hills.' },
      { day: '22+', instruction: 'Resume normal training with ongoing daily stretching routine.' },
    ],
    watchFor: [
      'Pain that intensifies throughout the day rather than improving',
      'Pain spreading up the ankle or lower leg',
      'Score rising above 5/10 during activity',
      'No improvement after 4 weeks of conservative management',
    ],
    escalationCriteria: 'If pain does not improve after 6 weeks of conservative treatment, or you develop numbness or weakness in the foot, seek physiotherapy assessment.',
    disclaimer: 'Plantar fasciitis is highly treatable with conservative management in most cases, but chronic cases benefit significantly from professional physiotherapy assessment and gait analysis.',
  },

  'patellar-tendinopathy': {
    description: 'Patellar tendinopathy (jumper\'s knee) is a common overuse injury affecting the tendon that connects the kneecap to the shinbone. It\'s associated with repetitive jumping, running, and squatting, and causes pain directly below the kneecap.',
    immediateActions: [
      'Reduce or pause running and jumping activities this week.',
      'Begin isometric exercises: wall sit at 60° for 45 seconds, 5 repetitions, twice daily.',
      'Apply ice 15–20 minutes after activity.',
      'Avoid full squats and deep lunges until pain score is below 3.',
    ],
    returnToTraining: [
      { day: '1–7', instruction: 'Isometric strengthening only. Cycling tolerated if pain-free.' },
      { day: '8–14', instruction: 'Isotonic exercises (slow-speed squats) if isometrics are pain-free.' },
      { day: '15–21', instruction: 'Easy running on flat if pain score is 2 or below.' },
      { day: '22+', instruction: 'Gradual return to sport-specific loading with progressive tendon work.' },
    ],
    watchFor: [
      'Pain that is present at rest or overnight',
      'Stiffness that does not improve within 20 minutes of warming up',
      'Swelling over the tendon below the kneecap',
      'Score exceeding 5/10 during activity',
    ],
    escalationCriteria: 'If pain does not improve with 3 weeks of isometric loading, or you experience sudden severe pain with swelling, seek physiotherapy or sports medicine review.',
    disclaimer: 'Patellar tendinopathy responds well to structured loading programmes. Avoid complete rest — tendons need load to heal. Guidance from a physiotherapist can significantly speed recovery.',
  },

  'it-band': {
    description: 'IT band syndrome (ITBS) occurs when the iliotibial band — a thick strip of tissue running from the hip to the outside of the knee — becomes tight and inflamed. It\'s extremely common in runners and cyclists, causing sharp pain on the outer knee.',
    immediateActions: [
      'Reduce running volume by 30–50% and avoid downhill running completely.',
      'Foam roll the outer thigh (not directly on the IT band) for 60–90 seconds each side.',
      'Stretch the hip abductors and glutes: cross-body stretch, 30 seconds each side.',
      'Avoid running through sharp outer-knee pain — this makes ITBS worse, not better.',
    ],
    returnToTraining: [
      { day: '1–5', instruction: 'Foam rolling and stretching only. Short easy runs (under 20 min) if pain-free.' },
      { day: '6–14', instruction: 'Gradual return to running: 10–15% mileage increase only. Avoid hills.' },
      { day: '15–21', instruction: 'Resume normal volume on flat terrain. Hip strengthening exercises daily.' },
      { day: '22+', instruction: 'Reintroduce hills and longer runs once hip strength is adequate.' },
    ],
    watchFor: [
      'Pain appearing earlier and earlier into each run',
      'Pain present while walking downstairs',
      'Pain on the outside of the hip as well as the knee',
      'Score above 5/10 that forces you to stop running mid-session',
    ],
    escalationCriteria: 'If pain consistently limits running to under 10 minutes, or you develop hip pain alongside knee symptoms, seek physiotherapy assessment to rule out hip bursitis.',
    disclaimer: 'ITBS rarely requires surgery or imaging. It responds well to hip strengthening, gait analysis, and load management. Chronic cases benefit from physiotherapy.',
  },

  'rotator-cuff': {
    description: 'Rotator cuff strain is an injury to one or more of the four small muscles that stabilise the shoulder joint. It typically results from repetitive overhead loading or a sudden force through the shoulder.',
    immediateActions: [
      'Avoid overhead pressing, pulling, and lateral raises until pain decreases.',
      'Apply ice 15–20 minutes 2–3 times per day for the first 48 hours.',
      'Keep the shoulder moving through gentle range-of-motion exercises.',
      'Do not use the arm for heavy lifting until pain score is below 2.',
    ],
    returnToTraining: [
      { day: '1–3', instruction: 'Rest from upper body loading. Gentle pendulum and range-of-motion exercises.' },
      { day: '4–7', instruction: 'Light resistance band external rotation if pain-free at 2/10 or below.' },
      { day: '8–14', instruction: 'Gradual return to shoulder exercises: start with 50% of normal load.' },
      { day: '15+', instruction: 'Progressive loading under physiotherapy guidance. Avoid rapid volume increases.' },
    ],
    watchFor: [
      'Pain or weakness when reaching overhead or behind your back',
      'Pain at rest, particularly at night when lying on the shoulder',
      'A clicking, grinding, or locking sensation in the shoulder',
      'Score above 5/10 with any movement',
    ],
    escalationCriteria: 'If pain does not improve within 2 weeks, or you experience sudden significant weakness in the arm, seek urgent physiotherapy or GP assessment — partial tears can be identified with ultrasound.',
    disclaimer: 'Minor rotator cuff strains respond well to conservative management. However, significant tears may require physiotherapy or surgical evaluation. Seek medical assessment if symptoms persist.',
  },

  'lower-back-strain': {
    description: 'Lower back strain is a muscle or ligament injury in the lumbar region, typically from sudden overloading, repetitive stress, or sustained poor posture under load. It is one of the most common sports-related injuries.',
    immediateActions: [
      'Reduce or pause strength training involving spinal loading (deadlifts, squats, bent rows).',
      'Keep moving — short walks are better than complete bed rest.',
      'Apply ice or heat based on what provides relief (try both).',
      'Avoid sitting for more than 30 minutes without a brief walk break.',
    ],
    returnToTraining: [
      { day: '1–3', instruction: 'Walking, gentle stretching. Avoid all spinal loading.' },
      { day: '4–7', instruction: 'Introduce core stability exercises: bird-dog, dead bug, gentle hip hinges.' },
      { day: '8–14', instruction: 'Bodyweight squats and light deadlifts (20–30% normal load) if pain-free.' },
      { day: '15+', instruction: 'Progressive return to normal training with focus on movement quality.' },
    ],
    watchFor: [
      'Pain radiating down one or both legs (possible nerve involvement)',
      'Numbness or tingling in the legs or feet',
      'Loss of bladder or bowel control — seek emergency care immediately',
      'Pain that prevents you from finding any comfortable position',
    ],
    escalationCriteria: 'If you develop pain, numbness, or tingling radiating below the knee, or if pain does not improve within 2 weeks of modified activity, seek GP assessment — this may involve nerve compression.',
    disclaimer: 'Most lower back strains resolve within 4–6 weeks with conservative management. Red-flag symptoms (leg numbness, bowel/bladder issues) require immediate medical attention.',
  },

  'elbow-tendinopathy': {
    description: 'Elbow tendinopathy covers lateral (tennis elbow) and medial (golfer\'s elbow) tendon injuries, typically from repetitive gripping, wrist extension, or pulling motions. Pain is located on the inside or outside of the elbow.',
    immediateActions: [
      'Reduce or pause exercises involving gripping, wrist curls, and heavy pulling.',
      'Begin eccentric wrist extension exercises: 3 sets of 15, twice daily.',
      'Ice the elbow for 10–15 minutes after any aggravating activity.',
      'Use a tennis elbow brace during any unavoidable gripping activity.',
    ],
    returnToTraining: [
      { day: '1–7', instruction: 'Eccentric exercises only. Rest from all heavy pulling and gripping.' },
      { day: '8–14', instruction: 'Introduce light resistance exercises if eccentric work is pain-free.' },
      { day: '15–21', instruction: 'Gradual return to strength work at 50% normal load, avoiding wrist flexion under load.' },
      { day: '22+', instruction: 'Progressive return to full training with ongoing elbow strengthening.' },
    ],
    watchFor: [
      'Pain spreading from the elbow up into the forearm or upper arm',
      'Weakness when shaking hands or opening jars',
      'Pain at rest or overnight',
      'Score above 5/10 with normal daily activities',
    ],
    escalationCriteria: 'If pain does not improve after 4 weeks of eccentric loading, or you develop significant weakness or altered sensation, seek physiotherapy or GP assessment.',
    disclaimer: 'Elbow tendinopathy is highly treatable with eccentric loading programmes. Most cases resolve within 6–12 weeks with appropriate management and load modification.',
  },

  'unclassified': {
    description: 'The pain location you\'ve reported doesn\'t match a specific injury pattern in our current database, or it\'s marked as uncertain. This doesn\'t mean the pain is not real or significant — it simply means we can\'t provide a specific protocol.',
    immediateActions: [
      'Monitor the pain score daily — if rising above 5/10, reduce training load.',
      'Avoid aggravating movements until the pain site is clearer.',
      'Consider seeing a physiotherapist to get a proper assessment.',
      'Log the pain location and trend daily to identify any patterns.',
    ],
    returnToTraining: [
      { day: '1–7', instruction: 'Continue normal training if pain score is 3 or below and stable.' },
      { day: '8+', instruction: 'Seek professional assessment if pain score rises or pattern becomes clearer.' },
    ],
    watchFor: [
      'Any pain that rises above 5/10',
      'Pain that alters how you walk, run, or move',
      'Pain at rest or overnight',
      'Any new neurological symptoms (numbness, tingling, weakness)',
    ],
    escalationCriteria: 'If pain score reaches 5/10 or higher, or if you experience any neurological symptoms, seek medical or physiotherapy assessment promptly.',
    disclaimer: 'This is not a diagnosis. Pain with unclear origin should be evaluated by a qualified sports medicine professional or physiotherapist.',
  },

}
