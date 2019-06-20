const core = require('biot-core');
const eventBus = require('ocore/event_bus');
const db = require('ocore/db');
const storage = require('ocore/storage');
const objectHash = require('ocore/object_hash.js');

const ChannelsManager = require('biot-core/lib/ChannelsManager');

const timeout = 20000; // 20 sec

let openChannels = {};
let profiles = {};

(async () => {
	await core.init('biot-co-working');
	let wallets = await core.getMyDeviceWallets();
	core.addCorrespondent('A20sbZ6knN/asHRHl3br1EAFaH0HvT/JT3NHE6RbkE3N@byteball.org/bb-test#test');
	
	eventBus.on('paired', (from_address) => {
		core.sendTechMessageToDevice(from_address, {type: 'imapp'});
	});
	
	eventBus.on('object', async (from_address, object) => {
		console.error('msg', from_address, object);
		if (object.app === 'BIoT') {
			if (object.type === 'hello') {
				if (openChannels[from_address]) {
					core.sendTechMessageToDevice(from_address, {
						type: 'render', page: 'index', form: [
							{
								type: 'text',
								title: (openChannels[from_address].myAmount - 1) + '/1000 bytes',
								id: 'balanceChannel'
							},
							{type: 'request', title: 'Close channel', req: 'close_channel'},
							{type: 'blank_line'},
							{type: 'list-menu', title: 'Switch on red light', req: 'switch_red'},
							{type: 'list-menu', title: 'Switch on green light', req: 'switch_green'},
							{type: 'list-menu', title: 'Switch on white light', req: 'switch_white'}
						]
					});
				} else {
					core.sendTechMessageToDevice(from_address, {
						type: 'render', page: 'index', form: [
							{
								type: 'h3',
								title: 'Scan RFID to start',
								id: 'scanRFID'
							},
							{type: 'blank_line'},
							{type: 'list-menu', title: 'Switch on red light', req: 'switch_red'},
							{type: 'list-menu', title: 'Switch on green light', req: 'switch_green'},
							{type: 'list-menu', title: 'Switch on white light', req: 'switch_white'}
						]
					});
				}
			} else if (object.type === 'request') {
				
				if (object.req === 'close_channel') {
					let res = await openChannels[from_address].closeMutually();
					if (res.error) {
						core.sendTechMessageToDevice(from_address, {
							type: 'alert', message: 'Error'
						});
					} else {
						core.sendTechMessageToDevice(from_address, {
							type: 'render', page: 'index', form: [
								{
									type: 'h3',
									title: 'Scan RFID to start',
									id: 'balanceChannel'
								},
								{type: 'blank_line'},
								{type: 'list-menu', title: 'Switch on red light', req: 'switch_red'},
								{type: 'list-menu', title: 'Switch on green light', req: 'switch_green'},
								{type: 'list-menu', title: 'Switch on white light', req: 'switch_white'}
							]
						});
					}
				}
				// else if (object.req === 'switch_red') {
				// 	core.sendTextMessageToDevice('0CAV5L4E2TNVEX7LEOT3W7F5ZKJEXXSOT', 'red');
				// } else if (object.req === 'switch_green') {
				// 	core.sendTextMessageToDevice('0CAV5L4E2TNVEX7LEOT3W7F5ZKJEXXSOT', 'green');
				// } else if (object.req === 'switch_white') {
				// 	core.sendTextMessageToDevice('0CAV5L4E2TNVEX7LEOT3W7F5ZKJEXXSOT', 'blue');
				// }
			}
		}
	});
	
	
	const channelsManager = new ChannelsManager(wallets[0], timeout);
	
	channelsManager.events.on('newChannel', async (objInfo) => {
		console.error(objInfo);
		let prms = objInfo.messageOnOpening;
		let channel = channelsManager.getNewChannel(objInfo);
		channel.events.on('error', error => {
			console.error('channelError', channel.id, error);
		});
		channel.events.on('start', () => {
			console.error('channel start. t.js', channel.id);
		});
		channel.events.on('changed_step', (step) => {
			console.error('changed_step: ', step);
		});
		channel.events.on('new_transfer', async (amount) => {
			core.sendTechMessageToDevice(channel.peerDeviceAddress, {
				type: 'update', id: 'balanceChannel', value: {
					type: 'text',
					title: (channel.myAmount - 1) + '/1000 bytes',
					id: 'balanceChannel'
				}
			});
		});
		await channel.init();
		if (await checkProfile(prms.address, prms.unit, prms.profile, channel.peerDeviceAddress) &&
			channel.myAmount === 1 && channel.peerAmount === 1001) {
			await channel.approve();
		} else {
			await channel.reject();
		}
		openChannels[channel.peerDeviceAddress] = channel;
	});
	
})().catch(console.error);

async function checkProfile(address, unit, profile, device_address) {
	try {
		profile = JSON.parse(profile);
	} catch (e) {
		return false;
	}
	const light_attestations = require('./light_attestations.js');
	await light_attestations.updateAttestationsInLight(address);
	let rows = await db.query("SELECT 1 FROM attestations CROSS JOIN unit_authors USING(unit)\n\
		WHERE attestations.address=? AND unit_authors.address IN(?) AND unit=?",
		[address, "ZZDZCNEHG6UT2WHPAL7JPOCCMK4HROB7", unit]);
	if (rows.length) {
		return new Promise(resolve => {
			storage.readJoint(db, unit, {
				ifNotFound: function () {
					eventBus.once('saved_unit-' + unit, (objJoint) => {
						handleJoint(objJoint, resolve)
					});
					var network = require('ocore/network.js');
					if (conf.bLight)
						network.requestHistoryFor([unit], []);
				},
				ifFound: (objJoint) => {
					handleJoint(objJoint, resolve)
				}
			});
		})
	} else {
		return false;
	}
	
	function handleJoint(objJoint, resolve) {
		let payload = objJoint.unit.messages.find(m => m.app === 'attestation').payload;
		if (payload.address === address) {
			let hidden_profile = {};
			profiles[device_address] = {};
			for (let field in profile) {
				let value = profile[field];
				profiles[device_address][field] = value[0];
				hidden_profile[field] = objectHash.getBase64Hash(value);
			}
			let profile_hash = objectHash.getBase64Hash(hidden_profile);
			
			
			if (profile_hash === payload.profile.profile_hash) {
				return resolve(true);
			} else {
				return resolve(false);
			}
		} else {
			resolve(false);
		}
	}
}