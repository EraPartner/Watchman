import dotenv from 'dotenv';
import snmp from 'net-snmp';

dotenv.config({ path: '.env.local' });

console.log('=== Alternative SNMP Test Approaches ===');

const host = process.env.SYNOLOGY_HOST;
const username = process.env.SYNOLOGY_SNMP_USERNAME;
const authKey = process.env.SYNOLOGY_SNMP_AUTH_KEY;
const privKey = process.env.SYNOLOGY_SNMP_PRIV_KEY;

console.log('Host:', host);
console.log('Username:', username);
console.log('Auth Key:', authKey);
console.log('Priv Key:', privKey);

// Try different approaches to match exactly what snmpwalk does

console.log('\n--- Approach 1: Using string protocol names ---');
try {
  const options1 = {
    port: 161,
    retries: 1,
    timeout: 5000,
    version: snmp.Version3,
    username: username,
    authProtocol: 'sha',  // Try string instead of constant
    authKey: authKey,
    privProtocol: 'aes',  // Try string instead of constant
    privKey: privKey
  };

  const session1 = snmp.createV3Session(host, options1);
  
  session1.get(['1.3.6.1.2.1.1.5.0'], (error, varbinds) => {
    if (error) {
      console.log('❌ Approach 1 failed:', error.message);
    } else {
      console.log('✅ Approach 1 Success! System name:', varbinds[0]?.value?.toString());
      session1.close();
      process.exit(0);
    }
    session1.close();
    
    // Try approach 2
    console.log('\n--- Approach 2: Different session creation ---');
    try {
      const session2 = snmp.createSession(host, 'public', {
        version: snmp.Version3,
        user: {
          name: username,
          level: snmp.SecurityLevel ? snmp.SecurityLevel.authPriv : 3,
          authProtocol: snmp.AuthProtocols ? snmp.AuthProtocols.sha : 'sha',
          authKey: authKey,
          privProtocol: snmp.PrivProtocols ? snmp.PrivProtocols.aes : 'aes',
          privKey: privKey
        }
      });

      session2.get(['1.3.6.1.2.1.1.5.0'], (error, varbinds) => {
        if (error) {
          console.log('❌ Approach 2 failed:', error.message);
        } else {
          console.log('✅ Approach 2 Success! System name:', varbinds[0]?.value?.toString());
          session2.close();
          process.exit(0);
        }
        session2.close();
        
        // Try approach 3
        console.log('\n--- Approach 3: Minimal configuration ---');
        try {
          const session3 = snmp.createV3Session(host, {
            version: snmp.Version3,
            username: username,
            authKey: authKey,
            privKey: privKey
          });

          session3.get(['1.3.6.1.2.1.1.5.0'], (error, varbinds) => {
            if (error) {
              console.log('❌ Approach 3 failed:', error.message);
            } else {
              console.log('✅ Approach 3 Success! System name:', varbinds[0]?.value?.toString());
            }
            session3.close();
            console.log('All approaches failed - may be a library compatibility issue');
            process.exit(error ? 1 : 0);
          });

        } catch (error) {
          console.log('❌ Approach 3 creation failed:', error.message);
          console.log('All approaches failed - may be a library compatibility issue');
          process.exit(1);
        }
      });

    } catch (error) {
      console.log('❌ Approach 2 creation failed:', error.message);
    }
  });

} catch (error) {
  console.log('❌ Approach 1 creation failed:', error.message);
}