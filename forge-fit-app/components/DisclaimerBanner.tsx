import { StyleSheet, Text, View } from 'react-native';

export function DisclaimerBanner() {
  return (
    <View style={styles.box}>
      <Text style={styles.text}>
        Answers in this tab come from a generative AI model with live web search. They can be
        incomplete or wrong. Don&apos;t use them for medical, legal, or financial decisions without
        verifying with a qualified source.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: '#2a210a',
    borderLeftColor: '#f1c40f',
    borderLeftWidth: 4,
    padding: 12,
    marginHorizontal: 6,
    marginBottom: 8,
    borderRadius: 10,
  },
  text: { color: '#f1e6b8', fontSize: 13, lineHeight: 18 },
});
