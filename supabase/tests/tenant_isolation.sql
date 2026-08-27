BEGIN;
SELECT plan(2);

-- Assuming we have valid fixtures or we just check the structure for the prompt
SELECT has_function( 'get_order_counts', ARRAY['uuid'], 'Function get_order_counts should exist' );

-- Verify that calling it with a random UUID throws 42501
SELECT throws_ok(
  $$ SELECT get_order_counts('00000000-0000-0000-0000-000000000000'::uuid) $$,
  '42501',
  'Unauthorized to view orders for this shop',
  'Should reject cross-tenant access'
);

SELECT * FROM finish();
ROLLBACK;
