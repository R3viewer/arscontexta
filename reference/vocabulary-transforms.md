# Vocabulary Transformation Reference

When generating a knowledge system for a specific domain, every universal term in the generated context file, templates, skills, and self/ files must use the domain-native equivalent. Vocabulary transformation is not cosmetic — it changes how the system feels to use.

"Surface patterns in reflections" is therapy work. "Extract claims from sources" is research work. Same structural operation, different cognitive framing.

---

## Universal → Domain Mapping

| Universal Term | Research | Therapy | Learning | Relationships | Creative | PM | Professional Assistant | Companion |
|---------------|----------|---------|----------|---------------|----------|-----|------------------------|-----------|
| note | claim | reflection | concept note | observation | idea | decision | insight | memory |
| extract / reduce | reduce | surface | break down | notice | discover | document | distill | remember |
| connect / reflect | reflect | find patterns | relate concepts | trace connections | combine ideas | link decisions | connect | recall together |
| verify | verify | check resonance | test understanding | confirm accuracy | evaluate draft | review quality | review | verify memory |
| reweave | reweave | revisit | revise | reconnect | rework | update | align | revisit |
| MOC | topic map | theme | study guide | relationship map | project hub | decision register | context map | memory collection |
| description field | claim context | reflection summary | concept explanation | observation context | idea sketch | decision rationale | context summary | memory context |
| topics footer | research areas | themes | study areas | relationship facets | creative projects | project areas | context maps | life areas |
| inbox | capture | journaling | study notes | encounters | inspiration | action items | inbox | moments |
| processing / pipeline | pipeline | reflection cycle | study cycle | relationship review | creative process | review cycle | distillation pipeline | reminiscence |
| wiki link | connection | pattern link | concept link | connection | inspiration thread | decision trail | connection | memory link |
| thinking notes | claims | reflections | concepts | observations | ideas | decisions | insights | memories |
| archive | processed sources | past reflections | mastered material | past encounters | completed works | closed decisions | archive | past events |
| self/ space | research identity | reflection partner | study companion | relationship tracker | creative identity | project mind | professional profile | companion memory |
| orient | orient | center | review progress | check in | survey ideas | status check | brief | remember |
| persist | persist | journal | log progress | update records | save state | update status | debrief | save memories |

---

## Template Name Mapping

| Universal Template | Research | Therapy | Learning | Relationships | Creative | PM | Professional Assistant | Companion |
|-------------------|----------|---------|----------|---------------|----------|-----|------------------------|-----------|
| base-note.md | thinking-note.md | reflection-note.md | concept-note.md | observation-note.md | idea-note.md | decision-note.md | insight-note.md | memory-note.md |
| moc.md | topic-map.md | theme.md | study-guide.md | relationship-map.md | project-hub.md | decision-register.md | context-map.md | collection.md |
| deliverable.md | — | — | — | — | — | — | deliverable-brief.md | — |

---

## Folder Name Mapping

| Universal Folder | Research | Therapy | Learning | Relationships | Creative | PM | Professional Assistant | Companion |
|-----------------|----------|---------|----------|---------------|----------|-----|------------------------|-----------|
| notes/ | notes/ | reflections/ | concepts/ | observations/ | ideas/ | decisions/ | notes/ | memories/ |
| inbox/ | inbox/ | journal/ | study-inbox/ | encounters/ | inspiration/ | action-items/ | inbox/ | moments/ |
| archive/ | archive/ | past/ | mastered/ | history/ | completed/ | closed/ | archive/ | past/ |
| templates/ | templates/ | templates/ | templates/ | templates/ | templates/ | templates/ | templates/ | templates/ |
| deliverables/ | — | — | — | — | drafts/ | — | deliverables/ | — |

---

## Skill Name Mapping

| Universal Skill | Research | Therapy | Learning | Relationships | Creative | PM | Professional Assistant | Companion |
|----------------|----------|---------|----------|---------------|----------|-----|------------------------|-----------|
| /reduce | /reduce | /surface | /break-down | /notice | /discover | /document | /distill | /capture |
| /reflect | /reflect | /find-patterns | /relate | /trace | /combine | /link | /connect | /recall |
| /verify | /verify | /check-resonance | /test | /confirm | /evaluate | /review | /review | /verify |
| /reweave | /reweave | /revisit | /revise | /reconnect | /rework | /update | /align | /revisit |
| /remember | /remember | /note-friction | /flag | /flag | /flag | /flag | /remember | /remember |
| /next | /next | /next | /next | /next | /next | /next | /next | /next |
| /stats | /stats | /stats | /stats | /stats | /stats | /stats | /stats | /stats |
| /graph | /graph | /graph | /graph | /graph | /graph | /graph | /graph | /graph |

**Note:** /remember (formerly /friction) captures operational friction with automatic detection in session transcripts. /next (formerly /work + /next) surfaces the next recommended action from the task stack. /stats provides vault metrics and progress visualization. /graph enables graph query generation. These commands use universal names across all domains.

---

## Applying Transformations

### In the init wizard (Step 5b):

1. Determine the user's use case
2. Look up all universal terms in the mapping table above
3. Replace every instance in the generated context file
4. Replace template names and folder names
5. Replace skill names if generating skills
6. **Verify:** Read the generated output. Does it feel natural for the domain? Would a therapy user ever see the word "claim"? Would a PM user see "reduce"?

### Quality check:

The vocabulary test: read the generated context file as if you were the domain user. Every technical term should feel native to the domain. If any term feels imported from a different discipline, transform it.

### Extending the table:

For "Custom / Mixed" use cases, the init wizard should ask the user for their preferred vocabulary. Populate a custom column using the universal terms as prompts: "What do you call a single knowledge unit?" → their answer becomes the "note" equivalent.
