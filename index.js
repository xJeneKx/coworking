const core = require('biot-core');
const eventBus = require('ocore/event_bus');
const db = require('ocore/db');
const storage = require('ocore/storage');
const objectHash = require('ocore/object_hash.js');

const ChannelsManager = require('biot-core/lib/ChannelsManager');

const SerialPort = require('serialport');
const port = new SerialPort('/dev/ttyUSB0', {baudRate: 9600});

const timeout = 20000; // 20 sec


const gpio = require("gpio");

// Calling export with a pin number will export that header and return a gpio header instance
let gpio4 = gpio.export(4, {
	// When you export a pin, the default direction is out. This allows you to set
	// the pin value to either LOW or HIGH (3.3V) from your program.
	direction: gpio.DIRECTION.OUT,
	
	// set the time interval (ms) between each read when watching for value changes
	// note: this is default to 100, setting value too low will cause high CPU usage
	interval: 200,
	
	// Due to the asynchronous nature of exporting a header, you may not be able to
	// read or write to the header right away. Place your logic in this ready
	// function to guarantee everything will get fired properly
	ready: function () {
		gpio4.set(0);
	}
});// Calling export with a pin number will export that header and return a gpio header instance
let gpio17 = gpio.export(17, {
	// When you export a pin, the default direction is out. This allows you to set
	// the pin value to either LOW or HIGH (3.3V) from your program.
	direction: gpio.DIRECTION.OUT,
	
	// set the time interval (ms) between each read when watching for value changes
	// note: this is default to 100, setting value too low will cause high CPU usage
	interval: 200,
	
	// Due to the asynchronous nature of exporting a header, you may not be able to
	// read or write to the header right away. Place your logic in this ready
	// function to guarantee everything will get fired properly
	ready: function () {
		gpio17.set(0);
	}
});// Calling export with a pin number will export that header and return a gpio header instance
let gpio27 = gpio.export(27, {
	// When you export a pin, the default direction is out. This allows you to set
	// the pin value to either LOW or HIGH (3.3V) from your program.
	direction: gpio.DIRECTION.OUT,
	
	// set the time interval (ms) between each read when watching for value changes
	// note: this is default to 100, setting value too low will cause high CPU usage
	interval: 200,
	
	// Due to the asynchronous nature of exporting a header, you may not be able to
	// read or write to the header right away. Place your logic in this ready
	// function to guarantee everything will get fired properly
	ready: function () {
		gpio27.set(0);
	}
});

let led = {z1: 0, z2: 0};

let parkingOwner = null;
let charging = false;


let openChannels = {};
let profiles = {};
let states = {};

(async () => {
	await core.init('biot-co-working');
	let wallets = await core.getMyDeviceWallets();
	
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
							{type: 'blank_line'},
							{type: 'list-menu', title: 'Use conference room', req: 'ucr', id: 'ucr'},
							{type: 'list-menu', title: 'Switch on zone 1 light', req: 'zone1'},
							{type: 'list-menu', title: 'Switch on zone 2 light', req: 'zone2'},
							{type: 'blank_line'},
							{type: 'list-menu', title: 'Use parking', req: 'up', id: 'up'},
							{type: 'list-menu', title: 'Use charging', req: 'uc', id: 'uc'},
							{type: 'blank_line'},
							{type: 'request', title: 'Close channel', req: 'close_channel'},
						]
					});
				} else {
					core.sendTechMessageToDevice(from_address, {
						type: 'render', page: 'index', form: [
							{
								type: 'h3',
								title: 'Scan QR to start',
								id: 'scanRFID'
							}
						]
					});
				}
			} else if (object.type === 'request') {
				if (!states[from_address]) states[from_address] = {};
				
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
									title: 'Scan QR to start',
									id: 'balanceChannel'
								}
							]
						});
					}
				} else if (object.req === 'ucr') {
					if (states[from_address].ucr) {
						core.sendTechMessageToDevice(from_address, {
							type: 'update', id: 'ucr', value: {
								type: 'list-menu',
								title: 'Use conference room',
								id: 'ucr',
								req: 'ucr'
							}
						});
						states[from_address].ucr = 0;
						port.write('open2\n');
					} else {
						core.sendTechMessageToDevice(from_address, {
							type: 'update', id: 'ucr', value: {
								type: 'list-menu',
								title: 'Stop using conference room',
								id: 'ucr',
								req: 'ucr'
							}
						});
						states[from_address].ucr = 1;
						port.write('open2\n');
					}
				} else if (object.req === 'up') {
					if (parkingOwner === null) {
						core.sendTechMessageToDevice(from_address, {
							type: 'update', id: 'up', value: {
								type: 'list-menu',
								title: 'Stop using parking',
								id: 'up',
								req: 'up'
							}
						});
						parkingOwner = from_address;
						port.write('open3\n');
					} else if (parkingOwner === from_address) {
						core.sendTechMessageToDevice(from_address, {
							type: 'update', id: 'up', value: {
								type: 'list-menu',
								title: 'Use parking',
								id: 'up',
								req: 'up'
							}
						});
						parkingOwner = null;
						port.write('open3\n');
						charging = false;
						gpio27.set(charging);
					} else {
						core.sendTechMessageToDevice(from_address, {
							type: 'alert', message: 'Parking already using'
						});
					}
				} else if (object.req === 'uc') {
					if (parkingOwner === null) {
						core.sendTechMessageToDevice(from_address, {
							type: 'alert', message: 'First rent the parking'
						});
					} else if (parkingOwner !== from_address) {
						core.sendTechMessageToDevice(from_address, {
							type: 'alert', message: 'Parking is used by another user'
						});
					} else if (parkingOwner === from_address) {
						charging = !charging;
						gpio27.set(charging);
					}
				} else if (object.req === 'zone1') {
					led.z1 = !led.z1;
					gpio17.set(led.z1);
				} else if (object.req === 'zone2') {
					led.z2 = !led.z2;
					gpio4.set(led.z2);
				}
			}
		}
	});
	
	
	const channelsManager = new ChannelsManager(wallets[0], timeout);
	
	channelsManager.events.on('newChannel', async (objInfo) => {
		let open = true;
		console.error(objInfo);
		let prms = objInfo.messageOnOpening;
		let channel = channelsManager.getNewChannel(objInfo);
		channel.events.on('error', error => {
			console.error('channelError', channel.id, error);
		});
		channel.events.on('start', async () => {
			port.write('open1\n');
			console.error('channel start ', channel.id);
			await sleep(6000);
			for (let i = 0; i < 2500; i++) {
				if (!open) break;
				let sum = 1;
				if (states[channel.peerDeviceAddress] && states[channel.peerDeviceAddress].ucr) sum += 1;
				if (parkingOwner === channel.peerDeviceAddress) sum += 1;
				if (parkingOwner === channel.peerDeviceAddress && charging) sum += 1;
				console.error('sum', sum);
				channel.sendMessage({amount: sum});
				await sleep(15000);
			}
			
			function sleep(time) {
				return new Promise(resolve => {
					setTimeout(resolve, time);
				})
			}
		});
		channel.events.on('changed_step', (step) => {
			if (step === 'mutualClose' || step === 'close') {
				port.write('open1\n');
				open = false;
				if (parkingOwner === channel.peerDeviceAddress) {
					setTimeout(() => {
						port.write('open3\n');
					}, 1000);
					parkingOwner = null;
					charging = false;
					gpio27.set(charging);
				}
				states[channel.peerDeviceAddress] = {};
			}
			console.error('changed_step: ', step);
		});
		channel.events.on('new_transfer', async (amount) => {
			console.error('new_transfer', amount);
			core.sendTechMessageToDevice(channel.peerDeviceAddress, {
				type: 'update', id: 'balanceChannel', value: {
					type: 'text',
					title: (channel.myAmount - 1) + '/7000 bytes',
					id: 'balanceChannel'
				}
			});
		});
		await channel.init();
		if (prms.address && (await checkProfile(prms.address, prms.unit, prms.profile, channel.peerDeviceAddress) &&
			channel.myAmount === 1 && channel.peerAmount === 7001)) {
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
		[address, "NJUSWNGMJ3NND4C4ZJ2DEDKW423FTULD", unit]);
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