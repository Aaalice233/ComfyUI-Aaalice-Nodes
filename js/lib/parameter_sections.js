/** Pure ParameterPanel section projection. Separators define boundaries but never become controls. */

export function partitionParameterSections(parameters) {
	const sections = [];
	let current = { separator: null, parameters: [] };
	const flush = () => {
		if (current.parameters.length) sections.push(current);
	};
	for (const parameter of parameters || []) {
		if (parameter?.param_type === "separator") {
			flush();
			current = { separator: parameter, parameters: [] };
			continue;
		}
		current.parameters.push(parameter);
	}
	flush();
	return sections;
}
