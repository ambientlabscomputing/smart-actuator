; Sample: Full circle (R=120 mm @ Z=150)
G21 ; mm
G90 ; absolute
G0 Z200 F3000 ; safe height
G0 X120.000 Y0.000 Z150.000
G3 X-120.000 Y0.000 Z150.000 I-120.000 J0.000 F900
G3 X120.000 Y0.000 Z150.000 I120.000 J0.000 F900
G0 Z200 F3000 ; return to safe height
; end of program