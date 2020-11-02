(function() {
    var _this = null; // will be initialized on preload
    const DEBUG = false;
    const AVATAR_ENTITIES = false;
    const GNOME_CONTENT_PREFIX = 'https://mpassets.highfidelity.com/31479af7-94b0-45f2-84ba-478d27e5af90-v1/';
    const GNOME_DEBRIS_PREFIX = GNOME_CONTENT_PREFIX + 'ShatteredPieces/';
    // Explosion sound from http://freesound.org/people/harpoyume/sounds/86026/ under CC BY-NC 3.0
    const EXPLOSION_SOUND_URL = GNOME_CONTENT_PREFIX + '86026__harpoyume__explosion-3.wav';
    // Laugh sound from http://freesound.org/people/thanvannispen/sounds/9557/ under CC BY 3.0
    const LAUGH_SOUND_URL = GNOME_CONTENT_PREFIX + '9557__thanvannispen__2gnomes.wav?v3';
    const FIRECRACKLING_SOUND_URL = GNOME_CONTENT_PREFIX + '49147__smidoid__fire48.wav';

    const SMOKE_TEXTURE_URL = GNOME_CONTENT_PREFIX + 'Particle-Sprite-Smoke-1.png';
    const EXPLOSION_TEXTURE_URL = GNOME_CONTENT_PREFIX + 'explode.png';
    const PI = 3.141593;
    const DEG_TO_RAD = PI / 180.0;
    const BLAST_POWER = 1.0;
    const THROW_SPEED_TRESHOLD = 2.0; // at least 2m/s
    const MIN_BULLET_IMPACT_SPEED = 1.0;
    const AVATAR_THRUST_MULITPLIER = 5;
    const SPIN_RATE = 20.0;
    const LEFT_HAND = 0;
    const RIGHT_HAND = 1;
    const BOTH_HANDS = 2;
    // Blast radius in meters
    const BLAST_RADIUS = 2.0;
    const BLAST_FALLOFF = 1.8;
    const DEBRIS_LIFETIME = 60;
    const DEBRIS_BURN_TIME = DEBRIS_LIFETIME * 1000; // 15 seconds
    const SMOKE_LIFETIME = 30;
    const DEBRIS_PARTS = [
        {
            model:  GNOME_DEBRIS_PREFIX + 'gnomeChunk1.fbx?v2',
            offset: {x: 0.002, y: 0.1, z: 0}
        },
        {
            model:  GNOME_DEBRIS_PREFIX + 'gnomeChunk2.fbx?v2',
            offset: {x: -0.002, y: 0.2, z: 0}
        },
        {
            model:  GNOME_DEBRIS_PREFIX + 'gnomeChunk3.fbx?v2',
            offset: {x: 0, y: 0.1, z: 0}
        },
        {
            model:  GNOME_DEBRIS_PREFIX + 'gnomeChunk4.fbx?v2',
            offset: {x: 0.1, y: 0, z: 0}
        },
        {
            model:  GNOME_DEBRIS_PREFIX + 'gnomeChunk5.fbx?v2',
            offset: {x: 0, y: -0.04, z: 0.1}
        }
    ];
    const DETONATION_MODE_IMPACT = 'impact';
    const DETONATION_MODE_TIMED = 'timed';

    var debugPrint = function(message) {
        if (DEBUG) {
            print(message);
        }
    }

    // define prototype WeaponizedGnome
    function WeaponizedGnome() {
        return;
    }

    WeaponizedGnome.prototype = {
        entityID: null,
        avatarImpactChannel: null,
        explosionSound: null,
        laughSound: null,
        laughSoundInjector: null,
        cracklingSound: null,
        smokeTexture: null,
        explosionTexture: null,
        exploding: false,
        thrown: false,
        hand: null,
        timerEnabled: false,
        rezzedDebris: null,
        detonationMode: DETONATION_MODE_IMPACT,
        createDebris: function(gnomeProperties) {
            _this.rezzedDebris = [];

            var debrisFirstCollisionImpactDetector = function(entityA, entityB, collisionData) {
                var debrisIndex = -1;
                for (var i = 0; i < _this.rezzedDebris.length; i++) {
                    if (_this.rezzedDebris[i].part === entityA || _this.rezzedDebris[i].part === entityB) {
                        debrisIndex = i;
                    }
                } 
                if (debrisIndex !== -1) {
                    var debris = _this.rezzedDebris[debrisIndex];
                    if (!debris.hadFirstCollision) {
                        debris.hadFirstCollision = true;
                        Entities.editEntity(debris.part, {
                            collisionSoundURL: '',
                            gravity: {x: 0.0, y: -10.0, z: 0.0}
                        });
                        debris.soundEmitter = _this.playSoundAtCurrentPosition(_this.cracklingSound,
                            Entities.getEntityProperties(debris.part, ['position']).position, 0.125, false, Math.random() * 2);
                    }
                }
            };

            Entities.collisionWithEntity.connect(debrisFirstCollisionImpactDetector);

            DEBRIS_PARTS.forEach(function(debrisPart) {
                var debrisPosition = Vec3.sum(gnomeProperties.position, debrisPart.offset);
                var debrisPart = Entities.addEntity({
                    type: 'Model',
                    name: 'weaponizedGnomeDebris',
                    modelURL: debrisPart.model,
                    collisionSoundURL: GNOME_CONTENT_PREFIX + '42900__freqman__glass-break-2-2.wav',
                    shapeType: 'sphere',
                    gravity: {
                        x: Math.random() - 0.5,
                        y: -10,
                        z: Math.random() - 0.5
                    },
                    damping: 0.35,
                    density: 10000,
                    restitution: 0.9, 
                    dynamic: true,
                    position: debrisPosition,
                    lifetime: DEBRIS_LIFETIME,
                    userData: JSON.stringify({
                        hifiHomeKey: {
                            reset: true
                        }
                    })
                }, AVATAR_ENTITIES);
                var debrisParticle = Entities.addEntity({
                    name: 'ParticleSmoke',
                    type: 'ParticleEffect',
                    isEmitting: true,
                    parentID: debrisPart,
                    position: debrisPosition,
                    textures: SMOKE_TEXTURE_URL,
                    emitRate: 15,
                    emitSpeed: 0,
                    color: { red: 180, green: 180, blue: 180},
                    colorSpread: {
                        red: 0,
                        green: 0,
                        blue: 0
                    },
                    colorStart: {
                        red: 0,
                        green: 9,
                        blue: 1
                    },
                    colorFinish: {
                        red: 180,
                        green: 180,
                        blue: 180
                    },
                    lifespan: 1, 
                    visible: true,
                    emitterShouldTrail: 1,
                    radiusSpread: 0,
                    radiusStart: 0.15,
                    radiusFinish: 0.00006,
                    lifetime: DEBRIS_LIFETIME,
                    polarStart: 0,
                    polarFinish: 0.23,
                    azimuthStart: -Math.PI,
                    azimuthFinish: Math.PI,
                    alpha: 0.1,
                    alphaSpread: .78,
                    alphaStart: 0.1,
                    alphaFinish: 0,
                    particleRadius: 0.063,
                    emitDimensions: {
                        x: 0,
                        y: 0.0,
                        z: 0
                    },
                    emitAcceleration: {
                        x: 0,
                        y: 0.8,
                        z: 0
                    },
                    maxParticles: 360,
                    speedSpread: 0.2,
                    emitOrientation: {
                        x: 0,
                        y: 0,
                        z: 0,
                        w: 0
                    },
                    accelerationSpread: {
                        x: 0,
                        y: 0,
                        z: 0
                    }
                }, AVATAR_ENTITIES);

                
                _this.rezzedDebris.push({part: debrisPart, particle: debrisParticle, soundEmitter: null, hadFirstCollision: false});
            });
            var updateSoundEmitter = Script.setInterval(function() {
                _this.rezzedDebris.forEach(function(debris) {
                    if (debris.soundEmitter !== null) {
                        debris.soundEmitter.position = Entities.getEntityProperties(debris.part, ['position']).position;
                    }
                });
            } ,1/60);
        },
        // Used Philip's grenade script for reference on this
        getImpactVelocityForPosition: function(epiCenter, impactPosition) {
            var difference = Vec3.subtract(impactPosition, epiCenter);
            var distance = Vec3.length(difference);
            return Vec3.multiply(BLAST_POWER * 1.0 / distance, Vec3.normalize(difference));
        },
        getImpactAngularVelocityForVelocity: function(velocity) {
            return Vec3.multiply(1.0 / Vec3.length(velocity), {
                x: Math.random() * SPIN_RATE,
                y: Math.random() * SPIN_RATE,
                z: Math.random() * SPIN_RATE
            });
        },
        playSoundAtCurrentPosition: function(sound, position, volume, loop, secondOffset) {
            var audioProperties = {volume: 0.5};
            if (loop !== undefined) {
                audioProperties.loop = loop;
            }
            if (position !== undefined) {
                audioProperties.position = position;
            }
            if (volume !== undefined) {
                audioProperties.volume = volume;
            }
            if (loop !== undefined) {
                audioProperties.loop = loop;
            }
            if (secondOffset !== undefined) {
                audioProperties.secondOffset = secondOffset;
            }
            return Audio.playSound(sound, audioProperties);
        },
        timedExplode: function() {
            if (_this.timerEnabled) {
                return;
            }
            var time = Math.floor(Math.random() * 5000) + 1;

            _this.detonationMode = DETONATION_MODE_TIMED;
            Script.setTimeout(function() {
                _this.explode();
            },  time);
            _this.timerEnabled = true;
        },
        explode: function() {
            if (_this.exploding) {
                return;
            }
            _this.exploding = true;
            var properties = Entities.getEntityProperties(_this.entityID, ['position', 'rotation']);
            if (_this.laughSoundInjector !== null && _this.laughSoundInjector.isPlaying()) {
                _this.laughSoundInjector.stop();
            }
            _this.playSoundAtCurrentPosition(_this.explosionSound, properties.position);
            Entities.addEntity({
                color: {red: 255, green: 255, blue: 255},
                isEmitting: 1,
                maxParticles: 1000,
                lifespan: 0.25,
                emitRate: 1,
                emitSpeed: 0.1,
                speedSpread: 1,
                emitDimensions: {
                    x: 0,
                    y: 0,
                    z: 0
                },
                polarStart: 0,
                polarFinish: 0,
                azimuthStart: 0,
                azimuthFinish: 0,
                emitAcceleration: {
                    x: 0,
                    y: 0,
                    z: 0
                },
                accelerationSpread: {
                    x: 0,
                    y: 0,
                    z: 0
                },
                particleRadius: BLAST_RADIUS,
                radiusSpread: 0,
                radiusStart: 0.361,
                radiusFinish: 0.294,
                colorSpread: {
                    red: 0,
                    green: 0,
                    blue: 0
                },
                colorStart: {
                    red: 255,
                    green: 255,
                    blue: 255
                },
                colorFinish: {
                    red: 255,
                    green: 255,
                    blue: 255
                },
                alpha: 1,
                alphaSpread: 0,
                alphaStart: -0.2,
                alphaFinish: 0.5,
                emitterShouldTrail: 0,
                textures: EXPLOSION_TEXTURE_URL,
                type: 'ParticleEffect',
                lifetime: 1,
                position: properties.position
            });

            Entities.editEntity(_this.entityID, {
                visible: false,
                dynamic: false,
                collidesWith: '',
                lifetime: DEBRIS_LIFETIME
            });
            _this.createDebris(properties);
            Messages.sendMessage(_this.avatarImpactChannel, JSON.stringify({epiCenter: properties.position}));
            Entities.findEntities(properties.position, BLAST_RADIUS).forEach(function(entity) {
                var entityProperties = Entities.getEntityProperties(entity,
                    ['dynamic', 'position', 'velocity', 'collisionless', 'collisionsWillMove', 'locked', 'collidesWith', 'type']);
                if (entityProperties.dynamic && !entityProperties.collisionless && entityProperties.collisionsWillMove &&
                    !entityProperties.locked && entityProperties.collidesWith.indexOf('dynamic') !== -1 && entityProperties.type !== 'Zone')
                {
                    var distance = Vec3.length(Vec3.subtract(entityProperties.position, properties.position));
                    if (distance < (BLAST_RADIUS / BLAST_FALLOFF)) {
                        Entities.callEntityMethod(entity, 'timedExplode');
                    }
                    var newVelocity = Vec3.sum(entityProperties.velocity, _this.getImpactVelocityForPosition(properties.position, entityProperties.position));
                    Entities.editEntity(entity, {
                        velocity: newVelocity,
                        angularVelocity: _this.getImpactAngularVelocityForVelocity(newVelocity)
                    });
                }
            });
        },
        preload: function(entityID) {
            _this = this;
            _this.entityID = entityID;
            _this.avatarImpactChannel = 'GnomeExplosionImpact_' + entityID;

            _this.explosionSound = SoundCache.getSound(EXPLOSION_SOUND_URL);
            _this.laughSound = SoundCache.getSound(LAUGH_SOUND_URL);
            _this.cracklingSound = SoundCache.getSound(FIRECRACKLING_SOUND_URL);
            _this.smokeTexture = TextureCache.prefetch(SMOKE_TEXTURE_URL);
            _this.explosionTexture = TextureCache.prefetch(EXPLOSION_TEXTURE_URL);
            Messages.subscribe(_this.avatarImpactChannel);
            Messages.messageReceived.connect(function(channel, message, senderID) {
                if (channel === _this.avatarImpactChannel) {
                    var avatarImpactData = JSON.parse(message);
                    debugPrint("GOT IMPACT DATA: "  + JSON.stringify(avatarImpactData, null, 4));
                    var velocity = _this.getImpactVelocityForPosition(avatarImpactData.epiCenter, MyAvatar.position);
                    if (Vec3.length(velocity) > 0) {
                        var thrust = Vec3.multiply(velocity, AVATAR_THRUST_MULITPLIER);
                        debugPrint("Thrust applied: "  + JSON.stringify(thrust, null, 4));
                        MyAvatar.addThrust(thrust);
                        Controller.triggerHapticPulse(Vec3.length(Vec3.subtract(avatarImpactData.epiCenter, MyAvatar.position)) / BLAST_RADIUS, 2.0, BOTH_HANDS);
                    }
                }
            });
        },
        unload: function() {
            if (_this.rezzedDebris !== null) {
                _this.rezzedDebris.forEach(function(debris) {
                    if (debris.soundEmitter !== null) {
                        debris.soundEmitter.stop();
                    }
                });
            }
            Messages.subscribe(_this.avatarImpactChannel);
        },
        startNearGrab: function(entityID, args) {
            this.hand = args[0] == "left" ? 0 : 1;
            debugPrint("grabbed with " + args[0] + " hand");

        },
        releaseGrab: function(entityID, args) {
            var properties = Entities.getEntityProperties(_this.entityID, ['position', 'velocity']);
            var throwSpeed = Vec3.length(properties.velocity);
            if (_this.hand == null || throwSpeed < THROW_SPEED_TRESHOLD) {
                return;
            }
            _this.thrown = true;
            
            _this.laughSoundInjector = _this.playSoundAtCurrentPosition(_this.laughSound, properties.position);
            var throwHand = this.hand === 'left' ? 0 : 1;
            Controller.triggerShortHapticPulse(1, throwHand);
            
        },
        collisionWithEntity: function(entityA, entityB, collisionInfo) {
            if (_this.thrown && _this.detonationMode === DETONATION_MODE_IMPACT) {
                _this.explode();
                return;
            }
       /*     var otherID = _this.entityID === entityA ? entityB : entityA; 
            // Detect Ping pong balls
            var otherProperties = Entities.getEntityProperties(otherID, ['shapeType', 'velocity']);
            var otherVelocity = Vec3.length(otherProperties.velocity);
            debugPrint('other velocity: ' + otherVelocity );
            debugPrint(otherProperties.shapeType);
            if (otherProperties.shapeType === 'sphere' && otherVelocity >= MIN_BULLET_IMPACT_SPEED) {
                _this.explode();
                return;
            }*/
        }

    };

    // entity scripts should return a newly constructed object of our type
    return new WeaponizedGnome();
});