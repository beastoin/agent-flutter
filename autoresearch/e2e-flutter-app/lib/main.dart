import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:marionette_flutter/marionette_flutter.dart';

void main() {
  if (kDebugMode) {
    MarionetteBinding.ensureInitialized();
  }
  runApp(const TestApp());
}

class TestApp extends StatelessWidget {
  const TestApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Marionette Test',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.blue),
        useMaterial3: true,
      ),
      home: const TestScreen(),
    );
  }
}

class TestScreen extends StatefulWidget {
  const TestScreen({super.key});

  @override
  State<TestScreen> createState() => _TestScreenState();
}

class _TestScreenState extends State<TestScreen> {
  String _statusText = 'Ready';
  int _counter = 0;
  bool _switchValue = false;
  String _nameValue = '';

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Marionette Test App'),
        backgroundColor: Theme.of(context).colorScheme.inversePrimary,
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(
            key: const ValueKey('status_text'),
            'Status: $_statusText',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Text(
                key: const ValueKey('counter_text'),
                'Counter: $_counter',
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              const SizedBox(width: 16),
              FilledButton(
                key: const ValueKey('increment_btn'),
                onPressed: () {
                  setState(() {
                    _counter++;
                    _statusText = 'Counter incremented to $_counter';
                  });
                },
                child: const Text('Increment'),
              ),
            ],
          ),
          const SizedBox(height: 16),
          TextField(
            key: const ValueKey('name_field'),
            decoration: const InputDecoration(
              labelText: 'Name',
              border: OutlineInputBorder(),
            ),
            onChanged: (value) {
              setState(() {
                _nameValue = value;
                _statusText = 'Name changed to: $value';
              });
            },
          ),
          const SizedBox(height: 8),
          Text(
            key: const ValueKey('name_display'),
            'Name: $_nameValue',
          ),
          const SizedBox(height: 16),
          SwitchListTile(
            key: const ValueKey('toggle_switch'),
            title: const Text('Enable feature'),
            value: _switchValue,
            onChanged: (value) {
              setState(() {
                _switchValue = value;
                _statusText = 'Switch ${value ? "ON" : "OFF"}';
              });
            },
          ),
          const SizedBox(height: 16),
          FilledButton(
            key: const ValueKey('submit_btn'),
            onPressed: () {
              setState(() {
                _statusText =
                    'Submitted: name=$_nameValue, switch=$_switchValue, counter=$_counter';
              });
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Form submitted!')),
              );
            },
            child: const Text('Submit'),
          ),
          const SizedBox(height: 16),
          OutlinedButton(
            key: const ValueKey('reset_btn'),
            onPressed: () {
              setState(() {
                _counter = 0;
                _switchValue = false;
                _nameValue = '';
                _statusText = 'Reset complete';
              });
            },
            child: const Text('Reset'),
          ),
        ],
      ),
    );
  }
}
