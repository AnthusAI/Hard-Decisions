# GLiNER2.5-Decide setup check (2026-10-03)

Our local setup (`fastino/GLiNER2.5-Decide@5a7adf7`, gliner2 2.0.0, PyTorch on MPS) on Fastino's own benchmark,
`fastino/fast-decisions@1a33070`, public dev split (17 domains, 100 rows each, 2,900 decisions), exact match per
decision as the dataset card defines it (`tools/gliner_fast_decisions_check.py`):

- Mean of domains **63.7%**; all decisions 62.4%. Fastino's model card reports **60.2%** on the held-out test split.
- Per domain: agent_handoff 76.0, banking_intent 64.0, benefits_request 78.0, clinic_request 66.0, document_type 79.0,
  email_triage 60.0, news_topic 69.0, paper_field 47.0, product_feedback 52.0, restaurant_review 50.0,
  review_sentiment 84.0, screen_tags 48.5, sports_recap 77.7, support_intent 76.0, support_topic 44.0,
  ticket_route 49.0, travel_request 63.0.

Other checks: the local checkpoint gives the hosted API's answers (21 of 21; confidence within 0.01); all 419
weight tensors equal the checkpoint file; transformers 4.48.1 (the checkpoint's) and 4.57.6 give identical outputs.
Conclusion: the setup reproduces the model's published behaviour; its ProofWriter results are the model's.
