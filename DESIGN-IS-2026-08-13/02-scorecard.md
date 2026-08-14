# Scorecard

1. Good design is innovative — **Score: 1/3**
   Evidence: The voice/WebGL home follows a familiar AI-orb pattern and the shell is explicitly transplanted from a reference implementation ([evidence](01-evidence.md#1-innovative)).
   Justification: It adds AI voice to an existing agency pattern but does not introduce a clearly better workflow pattern of its own.

2. Good design makes a product useful — **Score: 1/3**
   Evidence: Core task editing works, but the voice-only home, orphan workspaces, auth contradiction, and untriaged calendar create detours ([evidence](01-evidence.md#2-useful)).
   Justification: Users can complete core work, but cannot form or follow one direct end-to-end operating flow.

3. Good design is aesthetic — **Score: 1/3**
   Evidence: The new shell is internally clean, while mobile cards, the dense task modal, and the legacy board/theme system create several visible inconsistencies ([evidence](01-evidence.md#3-aesthetic)).
   Justification: A strong local visual system is undermined by multiple product-era styles and inefficient responsive composition.

4. Good design makes a product understandable — **Score: 1/3**
   Evidence: Stage/Status, Done/Close, Next review/deadline, read-only Settings, and mixed product names repeatedly misdescribe behavior ([evidence](01-evidence.md#4-understandable)).
   Justification: More than three primary controls or concepts require explanation, though the basic navigation is identifiable.

5. Good design is unobtrusive — **Score: 1/3**
   Evidence: The animated orb, persistent chrome, pre-board summary layer, and permanent editor toolbar compete with the work ([evidence](01-evidence.md#5-unobtrusive)).
   Justification: Decoration and chrome frequently become the figure instead of allowing client work to be the figure.

6. Good design is honest — **Score: 0/3**
   Evidence: False AI checkmarks, fabricated health delta, misleading password/public-link claims, and unscoped “You” notifications are behavioral misrepresentations ([evidence](01-evidence.md#6-honest)).
   Justification: Multiple flows state outcomes that the implementation does not guarantee.

7. Good design is long-lasting — **Score: 1/3**
   Evidence: Conventional shell foundations coexist with an AI glow orb, glassmorphism residue, and two visual systems ([evidence](01-evidence.md#7-long-lasting)).
   Justification: Several trend markers and migration seams tie the experience to distinct design eras.

8. Good design is thorough down to the last detail — **Score: 2/3**
   Evidence: Major UI states exist, but search contrast, landmark naming, label associations, Escape dismissal, and editor warnings remain rough ([evidence](01-evidence.md#8-thorough)).
   Justification: The state inventory is substantially present, but its edge quality is not ship-level consistent.

9. Good design is environmentally friendly — **Score: 0/3**
   Evidence: Development Home decodes over 9MB of JS, animates WebGL while idle and under reduced motion, and ignores system dark mode ([evidence](01-evidence.md#9-environmentally-friendly)).
   Justification: The rubric assigns zero when dark mode is ignored; the always-on canvas and high measured development weight reinforce it.

10. Good design is as little design as possible — **Score: 0/3**
    Evidence: Home is dominated by decoration, two board systems coexist, and substantial routes are both implemented and hidden ([evidence](01-evidence.md#10-as-little-design-as-possible)).
    Justification: Architectural duplication and decorative dominance prevent every element from earning its place.

## Total: 8/30

