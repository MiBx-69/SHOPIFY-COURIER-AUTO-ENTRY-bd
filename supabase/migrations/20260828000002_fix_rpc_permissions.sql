-- Fix RPC Permissions
GRANT EXECUTE ON FUNCTION get_order_counts(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_order_counts(uuid) TO service_role;
