import dotenv from 'dotenv';
import snmp from 'net-snmp';

dotenv.config({ path: '.env.local' });

console.log('=== Synology SNMP Configuration Check ===');
console.log('SYNOLOGY_HOST:', process.env.SYNOLOGY_HOST);
console.log('SYNOLOGY_SNMP_PORT:', process.env.SYNOLOGY_SNMP_PORT);
console.log('SYNOLOGY_SNMP_USERNAME:', process.env.SYNOLOGY_SNMP_USERNAME);
console.log('SYNOLOGY_SNMP_AUTH_PROTOCOL:', process.env.SYNOLOGY_SNMP_AUTH_PROTOCOL);
console.log('SYNOLOGY_SNMP_AUTH_KEY length:', process.env.SYNOLOGY_SNMP_AUTH_KEY?.length || 0);
console.log('SYNOLOGY_SNMP_PRIV_PROTOCOL:', process.env.SYNOLOGY_SNMP_PRIV_PROTOCOL);
console.log('SYNOLOGY_SNMP_PRIV_KEY length:', process.env.SYNOLOGY_SNMP_PRIV_KEY?.length || 0);

// Check if all required environment variables are present
const requiredVars = ['SYNOLOGY_HOST', 'SYNOLOGY_SNMP_USERNAME', 'SYNOLOGY_SNMP_AUTH_KEY', 'SYNOLOGY_SNMP_PRIV_KEY'];
const missingVars = requiredVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('❌ Missing required environment variables:', missingVars);
  process.exit(1);
}

// Test different SNMP configurations
console.log('\n=== Testing SNMPv3 Connection ===');

// Match the exact configuration that works with snmpwalk command:
// snmpwalk -v3 -u watchman -A 7ydUPqwBAqawvRcuFBJc -a SHA -X sZL95e4U2tqwcowCqYOt -l authPriv -x AES 192.168.0.192
const options = {
  port: parseInt(process.env.SYNOLOGY_SNMP_PORT) || 161,
  retries: 1,
  timeout: 5000,
  version: snmp.Version3,
  username: process.env.SYNOLOGY_SNMP_USERNAME,
  authProtocol: snmp.AuthProtocols.sha,  // Force SHA (matches -a SHA)
  authKey: process.env.SYNOLOGY_SNMP_AUTH_KEY,  // Matches -A 7ydUPqwBAqawvRcuFBJc
  privProtocol: snmp.PrivProtocols.aes,  // Force AES (matches -x AES)
  privKey: process.env.SYNOLOGY_SNMP_PRIV_KEY  // Matches -X sZL95e4U2tqwcowCqYOt
  // Remove the level parameter as it might not be supported properly
};

console.log('Connection options:');
console.log('- Host:', process.env.SYNOLOGY_HOST);
console.log('- Port:', options.port);
console.log('- Username:', options.username);
console.log('- Auth Protocol:', process.env.SYNOLOGY_SNMP_AUTH_PROTOCOL);
console.log('- Priv Protocol:', process.env.SYNOLOGY_SNMP_PRIV_PROTOCOL);

// Test basic connectivity first (ping-like)
console.log('\n--- Testing basic connectivity ---');

try {
  const session = snmp.createV3Session(process.env.SYNOLOGY_HOST, options);

  session.on('error', (error) => {
    console.error('❌ SNMP Session Error:', error.message);
    console.error('Error details:', error);
    
    // Try to provide helpful error interpretation
    if (error.message.includes('Unknown user name') || error.message.includes('invalid user')) {
      console.error('\n🔍 Troubleshooting: Invalid username error suggests:');
      console.error('   1. The SNMP user "watchman" does not exist on the Synology NAS');
      console.error('   2. Check Synology Control Panel > Terminal & SNMP > SNMP tab');
      console.error('   3. Ensure SNMPv3 is enabled and user "watchman" is configured');
    }
    
    process.exit(1);
  });

  // Test with system name OID (basic system info)
  const systemNameOID = '1.3.6.1.2.1.1.5.0';
  console.log('Testing SNMP GET with system name OID:', systemNameOID);

  session.get([systemNameOID], (error, varbinds) => {
    if (error) {
      console.error('❌ SNMP GET Error:', error.message);
      console.error('Error code:', error.code || 'N/A');
      console.error('Full error:', error);
      
      // Additional troubleshooting for common errors
      if (error.message.includes('Timeout')) {
        console.error('\n🔍 Troubleshooting: Timeout error suggests:');
        console.error('   1. SNMP service is not running on the Synology NAS');
        console.error('   2. Firewall is blocking SNMP port 161');
        console.error('   3. Incorrect IP address:', process.env.SYNOLOGY_HOST);
      }
    } else {
      console.log('✅ SNMP GET Success!');
      console.log('System name:', varbinds[0]?.value?.toString());
      console.log('VarBind details:', varbinds[0]);
    }
    
    session.close();
    process.exit(error ? 1 : 0);
  });

  // Set a timeout for the entire test
  setTimeout(() => {
    console.error('❌ Test timed out after 10 seconds');
    session.close();
    process.exit(1);
  }, 10000);

} catch (error) {
  console.error('❌ Failed to create SNMP session:', error.message);
  process.exit(1);
}