/* globals Camera Entities Vec3 Quat Controller Script MyAvatar AvatarManager Overlays RayPick HMD*/
//
//  gun.js
//
//  created by Rebecca Stankus on 11/07/18
//  Copyright 2018 High Fidelity, Inc.
//
//  Distributed under the Apache License, Version 2.0.
//  See the accompanying file LICENSE or http://www.apache.org/licenses/LICENSE-2.0.html
//
// This is the client script on the gun that will create the entities that it shoots

/* global Pointers, Graphics */
function exponentialSmoothing(target, current) {
    var smoothingConstant = 0.75;
    return target * (1 - smoothingConstant) + current * smoothingConstant;
}

(function() { 
    var _this;

    var TRIGGER_CONTROLS = [Controller.Standard.LT, Controller.Standard.RT];
    var TRIGGER_THRESHOLD = 0.97; // How far down the trigger is pressed
    var AUDIO_VOLUME_LEVEL = 0.1;
    var BARREL_LOCAL_OFFSET = {x: 0, y: 0, z: 0}; // Can adjust the position of the gun barrel for different shapes
    var BARREL_LOCAL_DIRECTION = {x: 0, y: 0, z: 1000}; // Which direction the gun shoots in
    var DESKTOP_HOW_TO_IMAGE_URL = Script.resolvePath("assets/textures/desktopFireUnequip.png");
    var DESKTOP_HOW_TO_IMAGE_WIDTH = 384;
    var DESKTOP_HOW_TO_IMAGE_HEIGHT = 128;
    var FIRE_KEY = "f";
    var HAND = {LEFT: 0, RIGHT: 1};
    var DESKTOP_HOW_TO_OVERLAY = true;
    var CAN_FIRE_AGAIN_TIMEOUT_MS = 250;
    var Y_OFFSET_FOR_WINDOW = 24;
    var VELOCITY_FACTOR = 5;
    var LIFETIME = 900; // How long each item should persist before being deleted

    var currentHand = null;
    var canShoot = true;
    var injector;
    var canFire = true;
    var mouseEquipAnimationHandler;
    var desktopHowToOverlay = null;
    var previousHMDActive;
    var previousLeftYPosition = 0;
    var previousLeftXRotation = 0;
    var previousLeftZRotation = 0;
    var previousRightYPosition = 0;
    var previousRightXRotation = 0;
    var previousRightZRotation = 0;
    var offsetMultiplier = 0.8;
    
    
    function Gun() {
        _this = this;
    }

    Gun.prototype = {

        preload: function(entityID) {
            _this.entityID = entityID;
            previousHMDActive = HMD.active; // storing whether or not the user is in HMD for later
        },

        
        // When the gun is equipped, store which hand it is in and whether the user is in HMD, listen for key release 
        // events, and if the user is in desktop, animate their avatar to be holding the gun and set up an instructional 
        // overlay so they know how to unequip and fire
        startEquip: function(id, params) {
            currentHand = params[0] === "left" ? 0 : 1;

            Controller.keyReleaseEvent.connect(_this.keyReleaseEvent);

            if (!HMD.active) {
                _this.addMouseEquipAnimation();
                _this.addDesktopOverlay();
            }
            
            previousHMDActive = HMD.active;
        },

        // While the gun is held, if the user switches between HMD and desktop, change the gun setup to account for it 
        // and listen for trigger pulls
        continueEquip: function(id, params) {
            if (currentHand === null) {
                return;
            }

            if (HMD.active !== previousHMDActive) {
                if (HMD.active) {
                    _this.removeDesktopOverlay();
                    _this.removeMouseEquipAnimation();
                } else {
                    _this.addDesktopOverlay();
                    _this.addMouseEquipAnimation();
                }
                previousHMDActive = HMD.active;
            }

            _this.toggleWithTriggerPressure();
        },

        // When the user releases the gun, remove the animation and instructional over lay if needed, stop listening 
        // for key events and set the current hand to none
        releaseEquip: function(id, params) {
            currentHand = null;

            Controller.keyReleaseEvent.disconnect(_this.keyReleaseEvent);

            _this.removeMouseEquipAnimation();
            _this.removeDesktopOverlay();
        },

        // On firing the gun, we trigger haptic feedback for 20ms at full strength. Then, we calculate the direction 
        // to shoot the item based on the position and rotation of the gun and change the rotation of the item to match. 
        // Then we create the item with velocity so it will be moving in the correct direction
        fire: function() {
            var HAPTIC_STRENGTH = 1;
            var HAPTIC_DURATION = 20;
            Controller.triggerHapticPulse(HAPTIC_STRENGTH, HAPTIC_DURATION, currentHand);
            var fireStart = this.getBarrelPosition();
            var barrelDirection = this.getBarrelDirection();
            var normalizedDirection = Vec3.normalize(barrelDirection);
            var velocity = Vec3.multiply(normalizedDirection, VELOCITY_FACTOR);
            var pickRay = {
                    origin: fireStart,
                    direction: normalizedDirection
                };
          	var closest;
		        var id;
		        var avatar = AvatarManager.findRayIntersection(pickRay);
		        var entity = Entities.findRayIntersection(pickRay, true);
		        var overlay = Overlays.findRayIntersection(pickRay, true);
          
          	closest = entity;
		        id = entity.entityID;
		        var type = 0;

		        if (avatar.intersects && avatar.distance < closest.distance) {
			      closest = avatar;
			      id = avatar.avatarID
			      type = 1;
		        } else if (overlay.intersects && overlay.distance < closest.distance) {
			      closest = overlay;
			      id = overlay.overlayID;
			      type = 2;
		        }

		       //print(JSON.stringify(closest.extraInfo.subMeshIndex) + " " + closest.intersects + " " + type);

		       if (closest.intersects) {
             Entities.addEntity({
              type: "Model",
              position: Vec3.mix(pickRay.origin, closest.intersection, 0.98),
               rotation: Quat.multiply(Quat.lookAtSimple(Vec3.ZERO, closest.surfaceNormal),Quat.rotationBetween(Vec3.FRONT, Vec3.UNIT_NEG_Y)),
              modelURL: "http://vegaslon.ddns.net:8080/3d%20plane.fbx",
              dimensions: { x:1, y: 0, z: 1 },
              ignorePickIntersection: true,
              lifetime: 100,  // Delete after 5 minutes.
              visible: true,
              });
		}
        },

        playSound: function(position, sound) {
            if (sound.downloaded) {
                if (injector) {
                    injector.stop();
                }
                injector = Audio.playSound(sound, {
                    position: Entities.getEntityProperties(_this.entityID, 'position').position,
                    volume: AUDIO_VOLUME_LEVEL
                });
            }
        },

        getBarrelPosition: function() {
            var properties = Entities.getEntityProperties(_this.entityID, ['position', 'rotation']);
            var barrelLocalPosition = Vec3.multiplyQbyV(properties.rotation, BARREL_LOCAL_OFFSET);
            var barrelWorldPosition = Vec3.sum(properties.position, barrelLocalPosition);
            return barrelWorldPosition;
        },

        getBarrelDirection: function() {
            var rotation = Entities.getEntityProperties(_this.entityID, ['rotation']).rotation;
            var barrelAdjustedDirection = Vec3.multiplyQbyV(rotation, BARREL_LOCAL_DIRECTION);
            return barrelAdjustedDirection;
        },

        // When the trigger is pressed past the set threshold while the gun is equipped, we either shoot or set a 
        // variable to allow it to shoot next time the trigger is pressed
        toggleWithTriggerPressure: function() {
            var triggerValue = Controller.getValue(TRIGGER_CONTROLS[currentHand]);
            if (triggerValue >= TRIGGER_THRESHOLD) {
                if (canShoot === true) {
                    _this.fire();
                    canShoot = false;
                }
            } else {
                canShoot = true;
            }
        },

        // Adding the overlay that tells users how to operate the gun in desktop. We must find the size of the screen 
        // and then position the overlay accordingly and store its state in the userData. If the overlay has already 
        // been created, we can reuse it's former properties
        addDesktopOverlay: function() {
            _this.removeDesktopOverlay();
            var userDataProperties = JSON.parse(Entities.getEntityProperties(_this.entityID, 'userData').userData);
            
            if (currentHand === null || !DESKTOP_HOW_TO_OVERLAY) {
                return;
            }

            var showOverlay = true;
            var otherHandDesktopOverlay = _this.getOtherHandDesktopOverlay();
            if (otherHandDesktopOverlay !== null) {
                desktopHowToOverlay = userDataProperties.desktopHowToOverlay;
                showOverlay = false;    
            }
            
            if (showOverlay) {
                var viewport = Controller.getViewportDimensions();
                var windowHeight = viewport.y;
                desktopHowToOverlay = Overlays.addOverlay("image", {
                    imageURL: DESKTOP_HOW_TO_IMAGE_URL,
                    x: 0,
                    y: windowHeight - DESKTOP_HOW_TO_IMAGE_HEIGHT - Y_OFFSET_FOR_WINDOW,
                    width: DESKTOP_HOW_TO_IMAGE_WIDTH,
                    height: DESKTOP_HOW_TO_IMAGE_HEIGHT,
                    alpha: 1.0,
                    visible: true
                });
                
                userDataProperties.desktopHowToOverlay = desktopHowToOverlay;
                Entities.editEntity(_this.entityID, {
                    userData: JSON.stringify(userDataProperties)
                });
            }
        },

        // checks userdata to reuse properties of the desktop overlay if possible
        getOtherHandDesktopOverlay: function() {
            var otherHandDesktopOverlay = null;
            if (currentHand !== null) {
                var handJointIndex = MyAvatar.getJointIndex(currentHand === HAND.LEFT ? "RightHand" : "LeftHand");
                var children = Entities.getChildrenIDsOfJoint(MyAvatar.SELF_ID, handJointIndex);
                children.forEach(function(childID) {
                    var userDataProperties = JSON.parse(Entities.getEntityProperties(childID, 'userData').userData);
                    if (userDataProperties.desktopHowToOverlay) {
                        otherHandDesktopOverlay = userDataProperties.desktopHowToOverlay;
                    }
                });
            }
            return otherHandDesktopOverlay;
        },
        
        removeDesktopOverlay: function() {
            var otherHandDesktopOverlay = _this.getOtherHandDesktopOverlay();
            if (desktopHowToOverlay !== null && otherHandDesktopOverlay === null) {
                Overlays.deleteOverlay(desktopHowToOverlay);
                desktopHowToOverlay = null;
            }
        },
        
        addMouseEquipAnimation: function() {
            _this.removeMouseEquipAnimation();
            if (currentHand === HAND.LEFT) {
                mouseEquipAnimationHandler = MyAvatar.addAnimationStateHandler(_this.leftHandMouseEquipAnimation, []);
            } else if (currentHand === HAND.RIGHT) {
                mouseEquipAnimationHandler = MyAvatar.addAnimationStateHandler(_this.rightHandMouseEquipAnimation, []);
            }           
        },
        
        removeMouseEquipAnimation: function() {
            if (mouseEquipAnimationHandler) {
                mouseEquipAnimationHandler = MyAvatar.removeAnimationStateHandler(mouseEquipAnimationHandler);
            }
        },
        
        // Here we calculate a position for the avatars left hand and the rest of the arm will position itself around  
        // this. We find the length of the arm, and position of the head (if a "Head" joint exists), then set the 
        // postion of the hand relative to them.
        leftHandMouseEquipAnimation: function() {
            var result = {};      
            result.leftHandType = 0;                        
            
            var leftHandPosition = MyAvatar.getJointPosition("LeftHand");
            var leftShoulderPosition = MyAvatar.getJointPosition("LeftShoulder");
            var shoulderToHandDistance = Vec3.distance(leftHandPosition, leftShoulderPosition);
            
            var cameraForward = Quat.getForward(Camera.orientation);
            var newForward = Vec3.multiply(cameraForward, shoulderToHandDistance);
            var newLeftHandPosition = Vec3.sum(leftShoulderPosition, newForward);
            var newLeftHandPositionAvatarFrame = Vec3.subtract(newLeftHandPosition, MyAvatar.position);
            
            var headIndex = MyAvatar.getJointIndex("Head");
            var offset = 0.5;
            if (headIndex) {
                offset = offsetMultiplier* MyAvatar.getAbsoluteJointTranslationInObjectFrame(headIndex).y;
            }
            result.leftHandPosition = Vec3.multiply(offset, {x: 0.0, y: 0.5, z: 0.0});
            var yPosition = exponentialSmoothing(newLeftHandPositionAvatarFrame.y, previousLeftYPosition);
            result.leftHandPosition.y = yPosition;
            previousLeftYPosition = yPosition;
            var leftHandPositionNew = Vec3.sum(MyAvatar.position, result.leftHandPosition);
            
            var rotation = Quat.lookAtSimple(leftHandPositionNew, leftShoulderPosition);
            var rotationAngles = Quat.safeEulerAngles(rotation);
            var xRotation = exponentialSmoothing(rotationAngles.x, previousLeftXRotation);
            var zRotation = exponentialSmoothing(rotationAngles.z, previousLeftZRotation);
            var newRotation = Quat.fromPitchYawRollDegrees(rotationAngles.x, 0, rotationAngles.z);
            previousLeftXRotation = xRotation;
            previousLeftZRotation = zRotation;
            result.leftHandRotation = Quat.multiply(newRotation, Quat.fromPitchYawRollDegrees(0, 0, 0));
            
            return result;
        },
        
        // see "leftHandMouseEquipAnimation" description
        rightHandMouseEquipAnimation: function() {
            var result = {};      
            result.rightHandType = 0;                       
            
            var rightHandPosition = MyAvatar.getJointPosition("RightHand");
            var rightShoulderPosition = MyAvatar.getJointPosition("RightShoulder");
            var shoulderToHandDistance = Vec3.distance(rightHandPosition, rightShoulderPosition);
            
            var cameraForward = Quat.getForward(Camera.orientation);
            var newForward = Vec3.multiply(cameraForward, shoulderToHandDistance);
            var newRightHandPosition = Vec3.sum(rightShoulderPosition, newForward);
            var newRightHandPositionAvatarFrame = Vec3.subtract(newRightHandPosition, MyAvatar.position);
            
            var headIndex = MyAvatar.getJointIndex("Head");
            var offset = 0.5;
            if (headIndex) {
                offset = offsetMultiplier * MyAvatar.getAbsoluteJointTranslationInObjectFrame(headIndex).y;
            }
            result.rightHandPosition = Vec3.multiply(offset, {x: -0.25, y: 0.6, z: 0.9});
            var yPosition = exponentialSmoothing(newRightHandPositionAvatarFrame.y, previousRightYPosition);
            result.rightHandPosition.y = yPosition;
            previousRightYPosition = yPosition;
            
            var rightHandPositionNew = Vec3.sum(MyAvatar.position, result.rightHandPosition);
            
            var rotation = Quat.lookAtSimple(rightHandPositionNew, rightShoulderPosition);
            var rotationAngles = Quat.safeEulerAngles(rotation);
            var xRotation = exponentialSmoothing(rotationAngles.x, previousRightXRotation);
            var zRotation = exponentialSmoothing(rotationAngles.z, previousRightZRotation);
            var newRotation = Quat.fromPitchYawRollDegrees(rotationAngles.x, 0, rotationAngles.z);
            previousRightXRotation = xRotation;
            previousRightZRotation = zRotation;
            result.rightHandRotation = Quat.multiply(newRotation, Quat.fromPitchYawRollDegrees(80, 0, 90));
            
            return result;
        },

        // listening for key events in desktop mode and preventing the gun from firing multiple times in succession 
        // by setting a "canShoot" variable
        keyReleaseEvent: function(event) {
            if ((event.text).toLowerCase() === FIRE_KEY) {
                if (canFire) {
                    canFire = false;
                    _this.fire();
                    Script.setTimeout(function() {
                        canFire = true;
                    }, CAN_FIRE_AGAIN_TIMEOUT_MS);
                }
            }
        },
        
        unload: function() {
            this.removeMouseEquipAnimation();
            this.removeDesktopOverlay();
        }
    };

    return new Gun();
});
