# blender -b -P animate.py -- in.glb out.glb
#
# Writes Idle + Walk clips onto an already-rigged GLB (24-bone humanoid, Mixamo naming).
# This is where ALL the motion in the game comes from - no motion capture, no AI,
# no downloaded animation. Just sin() driving bone rotations.
import bpy, sys, math, mathutils

src, dst = sys.argv[-2], sys.argv[-1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)

arm = next((o for o in bpy.data.objects if o.type == 'ARMATURE'), None)
if not arm:
    bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB')
    print("NO ARMATURE - exported unchanged"); sys.exit()

for a in list(bpy.data.actions):
    bpy.data.actions.remove(a)

bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='POSE')
have = {b.name for b in arm.pose.bones}
H = arm.dimensions.z
REST_ARM = 55.0          # A-pose -> arms down. X axis; Z swings them forward instead.

def kf(bone, frame, loc=None, rot=None):
    """One keyframe on one bone. rot is degrees (X, Y, Z)."""
    if bone not in have:
        return
    pb = arm.pose.bones[bone]
    if loc:
        pb.location = mathutils.Vector(loc)
        pb.keyframe_insert('location', frame=frame)
    if rot:
        pb.rotation_euler = mathutils.Euler([math.radians(r) for r in rot])
        pb.keyframe_insert('rotation_euler', frame=frame)

def bake(name, frames, fn):
    for pb in arm.pose.bones:
        pb.rotation_mode = 'XYZ'
        pb.location = (0, 0, 0)
        pb.rotation_euler = (0, 0, 0)
    arm.animation_data_create()
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    arm.animation_data.action = act
    for f in range(1, frames + 1):
        fn((f - 1) / frames, f)          # t goes 0 -> 1 across the clip
    for fc in act.fcurves:
        fc.modifiers.new('CYCLES')       # makes it loop forever, seamlessly
        for k in fc.keyframe_points:
            k.interpolation = 'BEZIER'   # ease in/out instead of robotic linear
    return act

def idle(t, f):
    breath = math.sin(t * 2 * math.pi)
    sway = math.sin(t * 2 * math.pi - 0.9)     # -0.9 rad lag: head trails the chest
    kf('Hips',     f, loc=(0, breath * 0.010 * H, 0))
    kf('Spine',    f, rot=(breath * 3.0, 0, 0))
    kf('Spine02',  f, rot=(breath * 2.0, 0, 0))
    kf('neck',     f, rot=(-breath * 2.4, 0, sway * 1.4))
    kf('Head',     f, rot=(-breath * 1.8, sway * 3.0, 0))
    kf('LeftArm',  f, rot=(REST_ARM, 0, sway * 2.6))
    kf('RightArm', f, rot=(REST_ARM, 0, -sway * 2.6))

def walk(t, f):
    a = t * 2 * math.pi
    swing = math.sin(a)
    # body bobs twice per stride, hence abs()
    kf('Hips',    f, loc=(0, abs(math.sin(a)) * 0.022 * H, 0), rot=(0, swing * 4, 0))
    kf('Spine',   f, rot=(4, 0, 0))
    kf('Head',    f, rot=(-3, -swing * 4, 0))
    # legs: opposite phase to each other
    kf('LeftUpLeg',  f, rot=(swing * 30, 0, 0))
    kf('RightUpLeg', f, rot=(-swing * 30, 0, 0))
    # knee only bends on the BACK half of its own swing - a knee never bends forward
    kf('LeftLeg',  f, rot=(max(0, -swing) * 42, 0, 0))
    kf('RightLeg', f, rot=(max(0, swing) * 42, 0, 0))
    kf('LeftFoot',  f, rot=(swing * 12, 0, 0))
    kf('RightFoot', f, rot=(-swing * 12, 0, 0))
    # arms swing OPPOSITE the leg on the same side, or it reads as a zombie
    kf('LeftArm',      f, rot=(REST_ARM, 0, -swing * 16))
    kf('RightArm',     f, rot=(REST_ARM, 0, swing * 16))
    kf('LeftForeArm',  f, rot=(0, 0, -abs(swing) * 10))
    kf('RightForeArm', f, rot=(0, 0, abs(swing) * 10))

bake("Idle", 72, idle)     # 72 frames @24fps = 3s breath
bake("Walk", 28, walk)     # 28 frames = ~1.2s stride
bpy.ops.object.mode_set(mode='OBJECT')

bpy.ops.export_scene.gltf(
    filepath=dst, export_format='GLB',
    export_animations=True, export_animation_mode='ACTIONS', export_yup=True,
)
print("CLIPS:", [a.name for a in bpy.data.actions])
